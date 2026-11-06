import config from '../config.js';
import { pool } from '../db/mysql.js';
import { httpError } from '../utils/schedule.js';
import { getDomesticAirports } from './airports.js';
import { fetchDepartures, toFlight } from './airlabs.js';
import { deleteByPrefix } from './cache.js';
import { buildGraph, getGraph } from './graph.js';
import { DATASET_URL, loadStaticFlights } from './staticSchedule.js';

const CHUNK = 1000;
let running = false;

const chunks = (items) => Array.from({ length: Math.ceil(items.length / CHUNK) }, (_, i) => items.slice(i * CHUNK, (i + 1) * CHUNK));

// Set-based comparison of a complete snapshot of one source (limited to `where`) against the database
async function reconcile(conn, source, flights, where, importId, force) {
  const [existing] = await conn.query(
    `SELECT service_key, content_hash, active FROM flights WHERE source = ? AND ${where.sql}`,
    [source, ...where.params],
  );
  const known = new Map(existing.map((r) => [r.service_key, r]));
  const counts = { inserted: 0, updated: 0, reactivated: 0, unchanged: 0, deactivated: 0 };
  const changed = [];
  for (const f of flights) {
    const prev = known.get(f.serviceKey);
    const kind = !prev ? 'inserted' : prev.content_hash !== f.contentHash ? 'updated' : !prev.active ? 'reactivated' : 'unchanged';
    counts[kind]++;
    if (kind !== 'unchanged') changed.push(f);
  }

  const seen = new Set(flights.map((f) => f.serviceKey));
  const active = existing.filter((r) => r.active);
  const missing = active.filter((r) => !seen.has(r.service_key)).map((r) => r.service_key);
  if (!force && flights.length < active.length * config.minSnapshotRatio) {
    throw httpError(
      422,
      `Snapshot has ${flights.length} flights but ${active.length} are active for this scope, which looks incomplete. ` +
        'Nothing was changed. Re-run with "force": true if the drop is real.',
    );
  }

  for (const chunk of chunks(changed)) {
    await conn.query(
      `INSERT INTO flights (source, service_key, airline_code, flight_no, dep_airport, arr_airport, dep_time, arr_time,
         arr_day_offset, days_of_week, effective_from, effective_to, aircraft, content_hash, active, last_import_id)
       VALUES ? AS new
       ON DUPLICATE KEY UPDATE airline_code = new.airline_code, dep_time = new.dep_time, arr_time = new.arr_time,
         arr_day_offset = new.arr_day_offset, effective_from = new.effective_from, effective_to = new.effective_to,
         aircraft = new.aircraft, content_hash = new.content_hash, active = TRUE, last_import_id = new.last_import_id`,
      [chunk.map((f) => [source, f.serviceKey, f.airlineCode, f.flightNo, f.depAirport, f.arrAirport, f.depTime,
        f.arrTime, f.arrDayOffset, f.days, f.effectiveFrom ?? null, f.effectiveTo ?? null, f.aircraft, f.contentHash,
        true, importId])],
    );
  }
  for (const chunk of chunks(missing)) {
    await conn.query(
      'UPDATE flights SET active = FALSE, last_import_id = ? WHERE source = ? AND service_key IN (?)',
      [importId, source, chunk],
    );
  }
  counts.deactivated = missing.length;
  return counts;
}

// Shared flow for every source: load a complete snapshot, reconcile it, rebuild the graph if anything changed.
// Any failure while loading aborts before writing, so a partial snapshot never deactivates flights.
async function runImport({ source, scope, where, force, load }) {
  if (running) throw httpError(409, 'A schedule import is already running');
  running = true;

  let importId;
  const stats = {};
  try {
    const [{ insertId }] = await pool.query('INSERT INTO schedule_imports (source, scope) VALUES (?, ?)', [
      source,
      JSON.stringify(scope),
    ]);
    importId = insertId;
    const flights = await load(stats);

    const conn = await pool.getConnection();
    let counts;
    try {
      await conn.beginTransaction();
      counts = await reconcile(conn, source, flights, where, importId, force);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    const summary = { ...stats, flights: flights.length, ...counts };
    await pool.query("UPDATE schedule_imports SET status = 'completed', summary = ?, finished_at = NOW() WHERE id = ?", [
      JSON.stringify(summary),
      importId,
    ]);
    const changed = counts.inserted + counts.updated + counts.reactivated + counts.deactivated > 0;
    const graph = changed ? await buildGraph() : getGraph();
    const routeCacheKeysDeleted = changed ? await deleteByPrefix('route:') : 0;
    return {
      importId,
      summary,
      graph: { version: graph.version, flights: graph.flightCount, airports: graph.departures.size, rebuilt: changed },
      routeCacheKeysDeleted,
    };
  } catch (err) {
    if (importId) {
      await pool.query("UPDATE schedule_imports SET status = 'failed', summary = ?, error = ?, finished_at = NOW() WHERE id = ?", [
        JSON.stringify(stats),
        err.message,
        importId,
      ]);
    }
    throw err;
  } finally {
    running = false;
  }
}

async function requireAirports() {
  const domestic = await getDomesticAirports();
  if (!domestic.size) throw httpError(400, 'No airports loaded yet; call POST /api/airports/import first');
  return domestic;
}

// Free static dataset: last year's schedule re-dated to this year's seasons
export async function importStaticSchedule({ force = false } = {}) {
  await requireAirports();
  return runImport({ source: 'static', scope: { dataset: DATASET_URL }, where: { sql: 'TRUE', params: [] }, force, load: loadStaticFlights });
}

// AirLabs routes, refreshed per departure airport
export async function refreshSchedule({ airports, force = false } = {}) {
  if (!config.airlabs.key) throw httpError(400, 'Set AIRLABS_API_KEY in backend/.env first');
  const domestic = await requireAirports();

  // Default scope: airports with scheduled service plus any we have seen flights arrive at
  const [rows] = await pool.query(
    "SELECT iata FROM airports WHERE scheduled_service UNION SELECT DISTINCT arr_airport FROM flights WHERE active AND source = 'airlabs'",
  );
  let scope = rows.map((r) => r.iata).sort();
  if (airports?.length) {
    scope = [...new Set(airports.map((a) => String(a).toUpperCase()))];
    const unknown = scope.filter((a) => !domestic.has(a));
    if (unknown.length) throw httpError(400, `Unknown airports: ${unknown.join(', ')}`);
  }

  return runImport({
    source: 'airlabs',
    scope,
    where: { sql: 'dep_airport IN (?)', params: [scope] },
    force,
    load: async (stats) => {
      Object.assign(stats, { airports: scope.length, requests: 0, rowsFetched: 0, skippedInternational: 0, skippedIncomplete: 0, duplicates: 0 });
      const flights = new Map();
      for (const airport of scope) {
        const { rows: routes, requests } = await fetchDepartures(airport);
        stats.requests += requests;
        stats.rowsFetched += routes.length;
        for (const row of routes) {
          const flight = toFlight(row);
          if (!flight) stats.skippedIncomplete++;
          else if (!domestic.has(flight.arrAirport)) stats.skippedInternational++;
          else {
            if (flights.has(flight.serviceKey)) stats.duplicates++;
            flights.set(flight.serviceKey, flight);
          }
        }
      }
      return [...flights.values()];
    },
  });
}
