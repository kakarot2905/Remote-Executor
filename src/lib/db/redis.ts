/** Redis client for queues/locks/rate limiting. */

import Redis from "ioredis";
import { config } from "../config";

let redis: Redis | null = null;

export const getRedis = (): Redis => {
  if (!redis) {
    redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
      enableAutoPipelining: true,
    });
  }
  return redis;
};
