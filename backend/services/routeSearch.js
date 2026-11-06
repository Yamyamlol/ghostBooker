import config from '../config.js';
import { pool } from '../db/mysql.js';
import { addDays, httpError, isoWeekday, toClock, weekdayAfter } from '../utils/schedule.js';
import { getJson, setJson, ttlFor } from './cache.js';
import { getGraph } from './graph.js';

// Day offset (from the travel date) on which `edge` can be caught after landing on `last`, or null if none fits.
// A continuing leg of the same flight number needs no minimum connection time.
function departureDay(last, edge, weekday, opts) {
  const earliest = last.arrAbs + (edge.flightNo === last.flightNo ? 0 : opts.minConnectionMinutes);
  const latest = last.arrAbs + opts.maxConnectionMinutes;
  for (let day = Math.floor(earliest / 1440); day * 1440 + edge.dep <= latest; day++) {
    if (day * 1440 + edge.dep >= earliest && edge.days.includes(weekdayAfter(weekday, day))) return day;
  }
  return null;
}

const toLeg = (edge, day) => ({
  flightId: edge.id,
  flightNo: edge.flightNo,
  airline: edge.airline,
  from: edge.from,
  to: edge.to,
  dayOffset: day,
  departs: toClock(edge.dep),
  arrives: toClock(edge.arr),
  depAbs: day * 1440 + edge.dep,
  arrAbs: day * 1440 + edge.arr,
  validFrom: edge.validFrom,
  validTo: edge.validTo,
});

const toPath = (legs, hiddenAt) => ({
  finalDestination: legs.at(-1).to,
  hiddenAt,
  legs,
  minutesToDestination: legs[hiddenAt].arrAbs - legs[0].depAbs,
  // Flying time the ticket adds after the destination; fares grow with it, so short extra hops rank first
  minutesBeyond: legs.slice(hiddenAt + 1).reduce((sum, leg) => sum + leg.arrAbs - leg.depAbs, 0),
  totalMinutes: legs.at(-1).arrAbs - legs[0].depAbs,
});

// Bounded DFS for origin -> ... -> destination -> ... -> beyond on a weekday, honouring connection windows.
// Effective dates are ignored here so the result is reusable for any date on that weekday; see filterForDate.
export function findHiddenCityPaths(graph, origin, destination, weekday, opts = config.search) {
  const paths = [];
  let truncated = false;

  const walk = (legs, visited, hiddenAt) => {
    const last = legs.at(-1);
    for (const edge of graph.departures.get(last ? last.to : origin) ?? []) {
      if (paths.length >= opts.maxPaths) {
        truncated = true;
        return;
      }
      if (visited.has(edge.to)) continue;
      // Until the destination is reached, the second-to-last allowed leg must land there to leave room beyond it
      if (hiddenAt < 0 && legs.length === opts.maxLegs - 2 && edge.to !== destination) continue;
      if (opts.sameAirlineOnly && last && edge.airline !== last.airline) continue;

      const day = last ? departureDay(last, edge, weekday, opts) : edge.days.includes(weekday) ? 0 : null;
      if (day === null) continue;

      const next = [...legs, toLeg(edge, day)];
      if (hiddenAt >= 0) paths.push(toPath(next, hiddenAt));
      if (next.length < opts.maxLegs) {
        visited.add(edge.to);
        walk(next, visited, hiddenAt >= 0 ? hiddenAt : edge.to === destination ? next.length - 1 : -1);
        visited.delete(edge.to);
      }
    }
  };

  walk([], new Set([origin]), -1);
  return { paths, truncated };
}

// Keep only paths whose every leg's schedule is in effect on the day that leg actually flies
export const filterForDate = (paths, date) =>
  paths.filter((p) =>
    p.legs.every((leg) => {
      const day = addDays(date, leg.dayOffset);
      return (!leg.validFrom || leg.validFrom <= day) && (!leg.validTo || day <= leg.validTo);
    }),
  );

const comparePaths = (a, b) =>
  a.legs.length - b.legs.length || a.minutesToDestination - b.minutesToDestination || a.totalMinutes - b.totalMinutes;

// Cheapest recently observed fare from origin to each ticket destination that stopped at our destination
async function roughEstimates(origin, destination, ticketDestinations, date) {
  if (!ticketDestinations.length) return new Map();
  const { estimateDateWindowDays: window, estimateMaxAgeDays: maxAge } = config.search;
  const [rows] = await pool.query(
    `SELECT destination, currency, MIN(price) AS price, MAX(observed_at) AS observedAt
     FROM fare_observations
     WHERE origin = ? AND destination IN (?) AND FIND_IN_SET(?, stops)
       AND departure_date BETWEEN ? AND ? AND observed_at >= NOW() - INTERVAL ? DAY
     GROUP BY destination, currency`,
    [origin, ticketDestinations, destination, addDays(date, -window), addDays(date, window), maxAge],
  );
  return new Map(rows.map((r) => [r.destination, { price: Number(r.price), currency: r.currency, observedAt: r.observedAt }]));
}

// Without a rough fare, destinations rank by fewest legs, then least extra flying past the destination
const compareDestinations = (a, b) =>
  a.bestPath.legs.length - b.bestPath.legs.length || a.bestPath.minutesBeyond - b.bestPath.minutesBeyond;

// Stage A: candidate ticket destinations from the local schedule only, no fare API calls
export async function getCandidates(origin, destination, date, candidateLimit = config.search.candidateLimit) {
  const graph = getGraph();
  if (!graph.flightCount) throw httpError(503, 'Flight schedule is empty; call POST /api/schedule/refresh first');

  const opts = config.search;
  const weekday = isoWeekday(date);
  const key = `route:v${graph.version}:${origin}:${destination}:${weekday}:` +
    `${opts.maxLegs}:${opts.minConnectionMinutes}:${opts.maxConnectionMinutes}:${opts.sameAirlineOnly ? 1 : 0}`;

  let cached = await getJson(key);
  const routeCache = cached ? 'hit' : 'miss';
  if (!cached) {
    cached = findHiddenCityPaths(graph, origin, destination, weekday, opts);
    await setJson(key, cached, ttlFor(config.ttl.route, date));
  }
  const paths = filterForDate(cached.paths, date);

  // One fare call per ticket destination covers every path to it, so rank destinations by their best path
  const byDestination = new Map();
  for (const path of paths) {
    const entry = byDestination.get(path.finalDestination) ?? { destination: path.finalDestination, pathCount: 0, bestPath: path };
    entry.pathCount++;
    if (comparePaths(path, entry.bestPath) < 0) entry.bestPath = path;
    byDestination.set(path.finalDestination, entry);
  }

  const estimates = await roughEstimates(origin, destination, [...byDestination.keys()], date);
  const candidates = [...byDestination.values()].map((c) => ({ ...c, estimate: estimates.get(c.destination) ?? null }));

  // Destinations with a rough estimate must be within the margin of the best one; unknown ones stay in play
  const best = Math.min(...candidates.filter((c) => c.estimate).map((c) => c.estimate.price));
  const ranked = candidates
    .filter((c) => !c.estimate || c.estimate.price <= best * (1 + opts.estimateMargin))
    .sort((a, b) => (a.estimate?.price ?? Infinity) - (b.estimate?.price ?? Infinity) || compareDestinations(a, b));
  const shortlist = ranked.slice(0, candidateLimit);
  const shortlisted = new Set(shortlist.map((c) => c.destination));

  return {
    origin,
    destination,
    date,
    graphVersion: graph.version,
    routeCache,
    truncated: cached.truncated,
    pathsFound: paths.length,
    shortlist,
    notShortlisted: ranked
      .concat(candidates.filter((c) => !ranked.includes(c)))
      .filter((c) => !shortlisted.has(c.destination))
      .map(({ destination: d, estimate, pathCount, bestPath }) => ({ destination: d, estimate, pathCount, minutesBeyond: bestPath.minutesBeyond })),
  };
}
