import { createHash } from 'node:crypto';
import config from '../config.js';
import { normalizeFlightNo, toMinutes } from '../utils/schedule.js';

const WEEKDAYS = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };
const FIELDS = 'airline_iata,flight_iata,flight_number,dep_iata,arr_iata,dep_time,arr_time,days,aircraft_icao';

async function getPage(depIata, offset) {
  const params = new URLSearchParams({
    api_key: config.airlabs.key,
    dep_iata: depIata,
    limit: config.airlabs.pageSize,
    offset,
    _fields: FIELDS,
  });
  const res = await fetch(`${config.airlabs.url}/routes?${params}`);
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.error) {
    throw new Error(`AirLabs routes for ${depIata} (offset ${offset}) failed: ${body?.error?.message ?? `HTTP ${res.status}`}`);
  }
  return body;
}

// Every route departing an airport, following pagination until the source reports no more rows.
// Free keys stop returning rows after the first page or two, so the count is checked against total_items.
export async function fetchDepartures(depIata) {
  const rows = [];
  let requests = 0;
  let total;
  for (let offset = 0; ; offset += config.airlabs.pageSize) {
    const body = await getPage(depIata, offset);
    requests++;
    const page = body.response ?? [];
    rows.push(...page);
    total = body.request?.total_items ?? total;
    const hasMore = body.request?.has_more ?? body.has_more ?? page.length === config.airlabs.pageSize;
    if (!hasMore || page.length === 0) break;
  }
  if (total != null && rows.length < total) {
    throw new Error(`AirLabs returned only ${rows.length} of ${total} routes for ${depIata}, so the snapshot is incomplete`);
  }
  return { rows, requests };
}

// AirLabs route row -> flight service, or null when the row lacks what the graph needs
export function toFlight(row) {
  const days = [...new Set((row.days ?? []).map((d) => WEEKDAYS[String(d).slice(0, 3).toLowerCase()]))]
    .filter(Boolean)
    .sort()
    .join('');
  const number = row.flight_number ?? row.flight_iata;
  if (!row.airline_iata || !number || !row.dep_iata || !row.arr_iata || !row.dep_time || !row.arr_time || !days) {
    return null;
  }

  const flightNo = normalizeFlightNo(row.airline_iata, number);
  const depMinutes = toMinutes(row.dep_time);
  const arrMinutes = toMinutes(row.arr_time);
  // Domestic India runs on one timezone, so an earlier arrival clock time means the next day
  const arrDayOffset = arrMinutes < depMinutes ? 1 : 0;
  const aircraft = row.aircraft_icao ?? null;

  return {
    serviceKey: `${flightNo}|${row.dep_iata}|${row.arr_iata}|${days}`,
    airlineCode: row.airline_iata,
    flightNo,
    depAirport: row.dep_iata,
    arrAirport: row.arr_iata,
    depTime: row.dep_time,
    arrTime: row.arr_time,
    arrDayOffset,
    days,
    aircraft,
    contentHash: createHash('sha1')
      .update(JSON.stringify([row.airline_iata, depMinutes, arrMinutes, arrDayOffset, aircraft]))
      .digest('hex'),
  };
}
