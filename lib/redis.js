import { Redis } from "@upstash/redis";

// Reads UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN from env
// (auto-injected if you use Vercel's Upstash integration, or set manually).
export const redis = Redis.fromEnv();

export const KEYS = {
  ALIVE_QUEUE: "proxy:alive:queue",   // Redis LIST -> ready-to-serve proxies
  ALIVE_SET: "proxy:alive:set",       // Redis SET  -> dedupe guard for what's currently queued
  LAST_RUN: "proxy:meta:last_run",
  DEAD_COUNT: "proxy:meta:dead_count", // Redis STRING -> just a counter for /api/stats.
  // NOTE: the actual dead-proxy list is NOT stored here. It lives in
  // data/dead-proxies.txt in the repo (see lib/dead-store.js), committed by
  // the GitHub Action after each refresh. Redis only ever holds the bounded,
  // actively-served alive queue + a scalar count for stats — nothing here
  // grows without limit.
};
