import config from '../config.js';
import { pool } from '../db/mysql.js';
import { httpError, normalizeFlightNo } from '../utils/schedule.js';
import { getJson, setJson, ttlFor } from './cache.js';

export const segmentsOf = (itinerary) =>
  itinerary.outbound?.segments ?? itinerary.legs?.flatMap((leg) => leg.segments ?? []) ?? [];

export const compactSegment = (s) => ({
  flightNo: normalizeFlightNo(s.marketing_carrier_code, s.flight_number),
  carrier: s.operating_carrier_name,
  from: s.departure_airport,
  to: s.arrival_airport,
  departs: s.departure_time_local,
  arrives: s.arrival_time_local,
});

// Store every returned itinerary as a rough-estimate source, and mark the scheduled flights it used as confirmed
async function recordObservations(origin, destination, date, itineraries) {
  const priced = itineraries.filter((it) => it.price?.amount != null && segmentsOf(it).length);
  if (!priced.length) return;

  await pool.query(
    'INSERT INTO fare_observations (origin, destination, departure_date, stops, price, currency, segments) VALUES ?',
    [priced.map((it) => {
      const segments = segmentsOf(it).map(compactSegment);
      const stops = segments.slice(0, -1).map((s) => s.to).join(',');
      return [origin, destination, date, stops, it.price.amount, it.price.currency, JSON.stringify(segments)];
    })],
  );

  const flown = new Map();
  for (const s of priced.flatMap((it) => segmentsOf(it).map(compactSegment))) flown.set(`${s.flightNo}|${s.from}|${s.to}`, [s.flightNo, s.from, s.to]);
  await pool.query('UPDATE flights SET last_confirmed_at = NOW() WHERE active AND (flight_no, dep_airport, arr_airport) IN (?)', [
    [...flown.values()],
  ]);
}

// Live one-way fares, cached per actual travel date and fare-affecting inputs
export async function getFares(origin, destination, date) {
  const { url, key, market, cabinClass } = config.ignav;
  const cacheKey = `fare:${origin}:${destination}:${date}:${cabinClass}:${market}:adults1`;
  const cached = await getJson(cacheKey);
  if (cached) return { ...cached, fromCache: true };

  const res = await fetch(`${url}/fares/one-way`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
    body: JSON.stringify({ origin, destination, departure_date: date, cabin_class: cabinClass, market }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) {
    const reason = body?.message ?? body?.detail ?? body?.error ?? res.statusText;
    throw httpError(502, `Ignav ${origin}-${destination} on ${date} failed (HTTP ${res.status}): ${typeof reason === 'string' ? reason : JSON.stringify(reason)}`);
  }

  const result = { itineraries: body.itineraries ?? [], observedAt: body.observed_at ?? new Date().toISOString() };
  await setJson(cacheKey, result, ttlFor(config.ttl.fare, date));
  try {
    await recordObservations(origin, destination, date, result.itineraries);
  } catch (err) {
    console.error('Recording fare observations failed:', err.message);
  }
  return { ...result, fromCache: false };
}
