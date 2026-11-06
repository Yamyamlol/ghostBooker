import { createClient } from 'redis';
import config from '../config.js';

// Fail commands fast while disconnected instead of queueing them, so a Redis outage degrades to cache misses
export const redis = createClient({ url: config.redisUrl, disableOfflineQueue: true });
redis.on('error', (err) => console.error('Redis error:', err.message));
