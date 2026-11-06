import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import config from '../config.js';

// dateStrings keeps DATE/TIME columns as 'YYYY-MM-DD' / 'HH:MM:SS' instead of timezone-shifted Date objects
export const pool = mysql.createPool({ ...config.mysql, dateStrings: true });

export async function migrate() {
  const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  for (const statement of schema.split(';').map((s) => s.trim()).filter(Boolean)) {
    await pool.query(statement);
  }
}
