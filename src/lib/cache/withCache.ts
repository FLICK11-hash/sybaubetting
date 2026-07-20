import { getRedisClient } from "./redis";

/**
 * Cache-aside helper for expensive read endpoints (the dashboard
 * aggregate is the main use case). If REDIS_URL isn't configured, or
 * Redis is unreachable, this transparently falls back to calling `compute`
 * directly on every request -- caching is an optimization, never a
 * dependency for correctness.
 */
export async function getOrSetCache<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
  const redis = getRedisClient();
  if (!redis) return compute();

  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as T;
  } catch (err) {
    console.error(`Redis GET failed for key "${key}" (falling back to compute):`, err);
    return compute();
  }

  const value = await compute();

  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    console.error(`Redis SET failed for key "${key}" (value still returned):`, err);
  }

  return value;
}
