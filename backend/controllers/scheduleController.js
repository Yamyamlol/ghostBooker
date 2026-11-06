import { pool } from '../db/mysql.js';
import { getGraph } from '../services/graph.js';
import { importStaticSchedule, refreshSchedule } from '../services/schedule.js';

// Manual triggers for now; a cron can call these services directly later
export const refresh = async (req, res) => {
  const { airports, force } = req.body ?? {};
  res.status(200).json({ success: true, ...(await refreshSchedule({ airports, force: force === true })) });
};

export const importStatic = async (req, res) => {
  res.status(200).json({ success: true, ...(await importStaticSchedule({ force: req.body?.force === true })) });
};

export const status = async (req, res) => {
  const graph = getGraph();
  const [[flights]] = await pool.query(
    'SELECT COUNT(*) AS total, COUNT(CASE WHEN active THEN 1 END) AS active, MAX(last_confirmed_at) AS lastConfirmedAt FROM flights',
  );
  const [recentImports] = await pool.query(
    'SELECT id, source, status, summary, error, started_at, finished_at FROM schedule_imports ORDER BY id DESC LIMIT 5',
  );
  res.status(200).json({
    success: true,
    graph: { version: graph.version, flights: graph.flightCount, airports: graph.departures.size, builtAt: graph.builtAt },
    flights,
    recentImports,
  });
};
