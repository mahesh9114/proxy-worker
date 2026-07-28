import { Redis } from "@upstash/redis";

// Reads UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN from env
// (auto-injected if you use Vercel's Upstash integration, or set manually).
export const redis = Redis.fromEnv();

export const KEYS = {
  ALIVE_QUEUE: "proxy:alive:queue", // Redis LIST -> ready-to-serve proxies
  ALIVE_SET: "proxy:alive:set", // Redis SET  -> dedupe guard for what's currently queued
  LAST_RUN: "proxy:meta:last_run",
  DEAD_COUNT: "proxy:meta:dead_count", // Redis STRING -> just a counter for /api/stats.
  // The GitHub Actions path (scripts/refresh.mjs) still logs dead proxies to
  // data/dead-proxies.txt via git commit (see lib/dead-store.js) — that list
  // never grows unbounded in Redis by design.
  //
  // api/refresh.js (the Vercel-triggered HTTP path, for cron-job.org) has no
  // git access, so it stores dead proxies here instead. Unlike the git file,
  // this Redis SET *will* grow without a hard limit over long-term use —
  // acceptable for Upstash's free tier at proxy-list scale, but worth
  // monitoring if you run refresh.js as your primary refresh path instead of
  // the GitHub Action.
  DEAD_SET: "proxy:dead:set",
};
