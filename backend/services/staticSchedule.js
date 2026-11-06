import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { AIRLINE_CODES, CITY_ALIASES } from '../constants/airports.js';
import { pool } from '../db/mysql.js';
import { addDays, normalizeFlightNo, toMinutes, today } from '../utils/schedule.js';

// Free Indian domestic schedule (2018 to Oct 2025) published on Hugging Face
export const DATASET_URL = 'https://huggingface.co/datasets/Kabil007/IndianDomesticAirlineDataset/resolve/main/Air-Clean.csv';

const WEEKDAYS = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7 };

const shiftYears = (date, years) => `${Number(date.slice(0, 4)) + years}${date.slice(4)}`.replace('-02-29', '-02-28');

// Re-date a past season to its next occurrence: add whole years until the window has not ended yet
function redate(validFrom, validTo) {
  const now = today();
  for (let years = 0; ; years++) {
    if (shiftYears(validTo, years) >= now) return [shiftYears(validFrom, years), shiftYears(validTo, years)];
  }
}

async function cityResolver() {
  const [airports] = await pool.query('SELECT iata, city, scheduled_service FROM airports');
  const byCity = new Map();
  // Scheduled airports sort last so they win when a city has more than one.
  // 'Ajmer (Kishangarh)' is indexed under both 'ajmer' and 'kishangarh'.
  for (const a of airports.sort((x, y) => x.scheduled_service - y.scheduled_service)) {
    for (const name of (a.city ?? '').split(/[()]/)) {
      if (name.trim()) byCity.set(name.trim().toLowerCase(), a.iata);
    }
  }
  const known = new Set(airports.map((a) => a.iata));
  return (city) => {
    const iata = CITY_ALIASES[city.toLowerCase()] ?? byCity.get(city.toLowerCase());
    return known.has(iata) ? iata : null;
  };
}

// Downloads the dataset and returns the latest 12 months of it as flight services
export async function loadStaticFlights(stats) {
  const res = await fetch(DATASET_URL);
  if (!res.ok) throw new Error(`Schedule dataset download failed: HTTP ${res.status}`);
  const rows = parse(await res.text(), { columns: true, skip_empty_lines: true, bom: true });
  const resolve = await cityResolver();

  const latest = rows.reduce((max, r) => (r.validTo > max ? r.validTo : max), '');
  const cutoff = addDays(latest, -365);
  const flights = new Map();
  const unmappedCities = {};
  Object.assign(stats, { rowsRead: rows.length, olderThanLatestYear: 0, skippedAirline: 0, skippedCity: 0, skippedIncomplete: 0, duplicates: 0 });

  for (const r of rows) {
    if (r.validTo <= cutoff) {
      stats.olderThanLatestYear++;
      continue;
    }
    const airline = AIRLINE_CODES[r.airline];
    if (!airline) {
      stats.skippedAirline++;
      continue;
    }
    const dep = resolve(r.origin);
    const arr = resolve(r.destination);
    if (!dep || !arr) {
      stats.skippedCity++;
      for (const city of [!dep && r.origin, !arr && r.destination].filter(Boolean)) unmappedCities[city] = (unmappedCities[city] ?? 0) + 1;
      continue;
    }
    const days = [...new Set(r.daysOfWeek.split(',').map((d) => WEEKDAYS[d.trim().toLowerCase()]))].filter(Boolean).sort().join('');
    if (!days || !r.scheduledDepartureTime || !r.scheduledArrivalTime || dep === arr) {
      stats.skippedIncomplete++;
      continue;
    }

    const flightNo = normalizeFlightNo(airline, r.flightNumber.replace(/\.0$/, ''));
    const depMinutes = toMinutes(r.scheduledDepartureTime);
    const arrMinutes = toMinutes(r.scheduledArrivalTime);
    const arrDayOffset = arrMinutes < depMinutes ? 1 : 0;
    const [effectiveFrom, effectiveTo] = redate(r.validFrom, r.validTo);
    const serviceKey = `${flightNo}|${dep}|${arr}|${days}|${effectiveFrom}`;
    if (flights.has(serviceKey)) stats.duplicates++;
    flights.set(serviceKey, {
      serviceKey,
      airlineCode: airline,
      flightNo,
      depAirport: dep,
      arrAirport: arr,
      depTime: r.scheduledDepartureTime,
      arrTime: r.scheduledArrivalTime,
      arrDayOffset,
      days,
      effectiveFrom,
      effectiveTo,
      aircraft: null,
      contentHash: createHash('sha1').update(JSON.stringify([airline, depMinutes, arrMinutes, arrDayOffset, effectiveTo])).digest('hex'),
    });
  }

  stats.unmappedCities = unmappedCities;
  return [...flights.values()];
}
