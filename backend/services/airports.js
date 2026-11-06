import { parse } from 'csv-parse/sync';
import { pool } from '../db/mysql.js';

// OurAirports publishes a free, nightly-updated airport list
const OURAIRPORTS_CSV = 'https://davidmegginson.github.io/ourairports-data/airports.csv';

export async function importAirports() {
  const res = await fetch(OURAIRPORTS_CSV);
  if (!res.ok) throw new Error(`OurAirports download failed: HTTP ${res.status}`);

  const rows = parse(await res.text(), { columns: true, skip_empty_lines: true })
    .filter((r) => r.iso_country === 'IN' && /^[A-Z]{3}$/.test(r.iata_code) && r.type.endsWith('_airport'))
    .map((r) => [r.iata_code, r.name, r.municipality || null, r.latitude_deg, r.longitude_deg, r.scheduled_service === 'yes']);

  await pool.query(
    `INSERT INTO airports (iata, name, city, latitude, longitude, scheduled_service) VALUES ? AS new
     ON DUPLICATE KEY UPDATE name = new.name, city = new.city, latitude = new.latitude,
       longitude = new.longitude, scheduled_service = new.scheduled_service`,
    [rows],
  );
  return { imported: rows.length, withScheduledService: rows.filter((r) => r[5]).length };
}

export async function getDomesticAirports() {
  const [rows] = await pool.query('SELECT iata FROM airports');
  return new Set(rows.map((r) => r.iata));
}
