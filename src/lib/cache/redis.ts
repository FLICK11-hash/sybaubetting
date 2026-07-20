import Redis from "ioredis";

let client: Redis | null | undefined;

/**
 * Returns a shared Redis client, or null if REDIS_URL isn't configured.
 * Redis is optional for this app (see README) -- every caller must handle
 * the null case by falling back to computing the value directly.
 */
export function getRedisClient(): Redis | null {
  if (client !== undefined) return client;

  const url = process.env.REDIS_URL;
  if (!url) {
    client = null;
    return client;
  }

  client = new Redis(url, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    retryStrategy: () => null, // don't keep retrying forever if Redis is unreachable
  });
  client.on("error", (err) => {
    console.error("Redis connection error (continuing without cache):", err.message);
  });
  return client;
}
