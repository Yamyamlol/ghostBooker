import express from 'express';
import config from './config.js';
import { migrate } from './db/mysql.js';
import { redis } from './db/redis.js';
import { buildGraph } from './services/graph.js';
import airportRoutes from './routes/airportRoutes.js';
import flightRoutes from './routes/flightRoutes.js';
import scheduleRoutes from './routes/scheduleRoutes.js';

const app = express();
app.use(express.json());

app.use('/api/airports', airportRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/flights', flightRoutes);

app.use((err, req, res, next) => {
  if (!err.status || err.status >= 500) console.error(err);
  res.status(err.status ?? 500).json({ success: false, message: err.message });
});

await migrate();
await redis.connect();
const graph = await buildGraph();
console.log(`Flight graph v${graph.version}: ${graph.flightCount} flights from ${graph.departures.size} airports`);

app.listen(config.port, () => {
  console.log(`ghostBooker backend listening on port ${config.port}`);
});
