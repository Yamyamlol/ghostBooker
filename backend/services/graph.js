import { pool } from '../db/mysql.js';
import { toMinutes } from '../utils/schedule.js';

let graph = { version: 0, departures: new Map(), flightCount: 0, builtAt: null };

export const getGraph = () => graph;

// Directed adjacency list shared by every search: airport -> scheduled flights departing it.
// version is the last import that changed a flight row, so caches keyed on it go stale only with real changes.
export async function buildGraph() {
  const [[{ version }]] = await pool.query('SELECT COALESCE(MAX(last_import_id), 0) AS version FROM flights');
  const [rows] = await pool.query(
    `SELECT id, airline_code, flight_no, dep_airport, arr_airport, dep_time, arr_time, arr_day_offset,
       days_of_week, effective_from, effective_to
     FROM flights
     WHERE active AND (effective_to IS NULL OR effective_to >= CURDATE())`,
  );

  const departures = new Map();
  for (const r of rows) {
    if (!departures.has(r.dep_airport)) departures.set(r.dep_airport, []);
    departures.get(r.dep_airport).push({
      id: r.id,
      airline: r.airline_code,
      flightNo: r.flight_no,
      from: r.dep_airport,
      to: r.arr_airport,
      dep: toMinutes(r.dep_time),
      arr: toMinutes(r.arr_time) + 1440 * r.arr_day_offset,
      days: r.days_of_week,
      validFrom: r.effective_from,
      validTo: r.effective_to,
    });
  }

  graph = { version, departures, flightCount: rows.length, builtAt: new Date().toISOString() };
  return graph;
}
