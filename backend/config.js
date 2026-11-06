import 'dotenv/config';

const num = (name, fallback) => (process.env[name] ? Number(process.env[name]) : fallback);

export default {
  port: num('PORT', 3000),
  mysql: {
    host: process.env.MYSQL_HOST,
    port: num('MYSQL_PORT', 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  },
  redisUrl: process.env.REDIS_URL,
  ignav: {
    url: process.env.IGNAV_API_URL,
    key: process.env.IGNAV_API_KEY,
    market: process.env.IGNAV_MARKET || 'IN',
    cabinClass: process.env.IGNAV_CABIN_CLASS || 'economy',
  },
  airlabs: {
    url: process.env.AIRLABS_API_URL || 'https://airlabs.co/api/v9',
    key: process.env.AIRLABS_API_KEY,
    pageSize: num('AIRLABS_PAGE_SIZE', 50), // free keys are capped at 50 rows per request
  },
  search: {
    maxLegs: num('SEARCH_MAX_LEGS', 2), // legs on the booked ticket, including those flown past the destination
    minConnectionMinutes: num('MIN_CONNECTION_MINUTES', 60),
    maxConnectionMinutes: num('MAX_CONNECTION_MINUTES', 360),
    sameAirlineOnly: process.env.SAME_AIRLINE_ONLY !== 'false',
    maxPaths: num('SEARCH_MAX_PATHS', 5000),
    candidateLimit: num('CANDIDATE_LIMIT', 5),
    estimateMargin: num('ESTIMATE_MARGIN', 0.2),
    estimateDateWindowDays: num('ESTIMATE_DATE_WINDOW_DAYS', 7),
    estimateMaxAgeDays: num('ESTIMATE_MAX_AGE_DAYS', 14),
  },
  // A refresh may not deactivate flights if it returns less than this share of what is active now
  minSnapshotRatio: num('MIN_SNAPSHOT_RATIO', 0.5),
  // [max days until departure, ttl seconds]; the first band that fits wins
  ttl: {
    fare: [[3, 30 * 60], [14, 2 * 3600], [60, 6 * 3600], [Infinity, 24 * 3600]],
    route: [[7, 12 * 3600], [Infinity, 7 * 24 * 3600]],
  },
};
