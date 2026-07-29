import { Redis } from "@upstash/redis";

// Reads UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN from env
// (auto-injected if you use Vercel's Upstash integration, or set manually).
export const redis = Redis.fromEnv();

export const KEYS = {
  ALIVE_QUEUE: "proxy:alive:queue",
  ALIVE_SET: "proxy:alive:set",
  LAST_RUN: "proxy:meta:last_run",
  DEAD_COUNT: "proxy:meta:dead_count",
  DEAD_SET: "proxy:dead:set",
  REFRESH_LOCK: "proxy:meta:refresh_lock",
};
