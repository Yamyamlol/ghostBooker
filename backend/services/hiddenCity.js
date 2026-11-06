import { compactSegment, getFares, segmentsOf } from './fares.js';
import { getCandidates } from './routeSearch.js';

const cheapest = (itineraries) =>
  itineraries.filter((it) => it.price?.amount != null).sort((a, b) => a.price.amount - b.price.amount)[0] ?? null;

// A ticket to somewhere beyond `destination` whose itinerary lands at `destination` before its final stop
function toOption(itinerary, destination, direct) {
  const segments = segmentsOf(itinerary);
  const stopIndex = segments.slice(0, -1).findIndex((s) => s.arrival_airport === destination);
  if (stopIndex < 0 || itinerary.price?.amount == null) return null;

  return {
    ticketTo: segments.at(-1).arrival_airport,
    price: itinerary.price,
    savingsVsDirect: direct?.price.currency === itinerary.price.currency ? direct.price.amount - itinerary.price.amount : null,
    arriveAtDestination: segments[stopIndex].arrival_time_local,
    flightsToTake: segments.slice(0, stopIndex + 1).map(compactSegment),
    flightsToSkip: segments.slice(stopIndex + 1).map(compactSegment),
    hasMixedCarriers: itinerary.has_mixed_carriers ?? null,
    ignavId: itinerary.ignav_id,
  };
}

// Stage A (local schedule) picks ticket destinations; Stage B verifies them with live fares
export async function searchHiddenCity(origin, destination, date, candidateLimit) {
  const candidates = await getCandidates(origin, destination, date, candidateLimit);
  const [directResult, ...candidateResults] = await Promise.allSettled([
    getFares(origin, destination, date),
    ...candidates.shortlist.map((c) => getFares(origin, c.destination, date)),
  ]);

  const directItinerary = directResult.status === 'fulfilled' ? cheapest(directResult.value.itineraries) : null;
  const direct = directItinerary && {
    price: directItinerary.price,
    flights: segmentsOf(directItinerary).map(compactSegment),
    ignavId: directItinerary.ignav_id,
  };

  const options = [];
  const checked = candidates.shortlist.map((c, i) => {
    const result = candidateResults[i];
    const base = { ticketTo: c.destination, estimate: c.estimate, predictedPath: c.bestPath.legs.map((l) => `${l.flightNo} ${l.from}-${l.to} ${l.departs}`) };
    if (result.status === 'rejected') return { ...base, error: result.reason.message };

    const found = result.value.itineraries.map((it) => toOption(it, destination, direct)).filter(Boolean);
    options.push(...found.map((o) => ({ ...o, fareObservedAt: result.value.observedAt })));
    return { ...base, fromCache: result.value.fromCache, itinerariesReturned: result.value.itineraries.length, hiddenCityMatches: found.length };
  });
  options.sort((a, b) => a.price.amount - b.price.amount);

  const fareResults = [directResult, ...candidateResults].filter((r) => r.status === 'fulfilled');
  return {
    origin,
    destination,
    date,
    direct,
    directError: directResult.status === 'rejected' ? directResult.reason.message : undefined,
    options,
    checked,
    notShortlisted: candidates.notShortlisted,
    meta: {
      graphVersion: candidates.graphVersion,
      routeCache: candidates.routeCache,
      pathsFound: candidates.pathsFound,
      truncated: candidates.truncated,
      fareApiCalls: fareResults.filter((r) => !r.value.fromCache).length,
      fareCacheHits: fareResults.filter((r) => r.value.fromCache).length,
      failedFareCalls: 1 + candidates.shortlist.length - fareResults.length,
    },
  };
}
