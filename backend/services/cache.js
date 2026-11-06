import { redis } from '../db/redis.js';
import { daysUntil } from '../utils/schedule.js';

// TTL shrinks as the travel date approaches; bands are [max days until departure, ttl seconds]
export const ttlFor = (bands, date) => bands.find(([maxDays]) => daysUntil(date) <= maxDays)[1];

// Cache errors are treated as misses: a Redis outage costs extra work, never a failed search
export async function getJson(key) {
  try {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  } catch (err) {
    console.error(`Cache read failed for ${key}:`, err.message);
    return null;
  }
}

export async function setJson(key, value, ttlSeconds) {
  try {
    await redis.set(key, JSON.stringify(value), { expiration: { type: 'EX', value: ttlSeconds } });
  } catch (err) {
    console.error(`Cache write failed for ${key}:`, err.message);
  }
}

export async function deleteByPrefix(prefix) {
  let deleted = 0;
  try {
    for await (const keys of redis.scanIterator({ MATCH: `${prefix}*`, COUNT: 500 })) {
      if (keys.length) deleted += await redis.del(keys);
    }
  } catch (err) {
    console.error(`Cache invalidation failed for ${prefix}*:`, err.message);
  }
  return deleted;
}
