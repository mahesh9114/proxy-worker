import { redis, KEYS } from "../lib/redis.js";
import { fetchAllCandidates } from "../lib/sources.js";
import { testBatch } from "../lib/test-proxy.js";
import { loadDeadSet } from "../lib/dead-store.js";

// Vercel functions have no git-write access, so this endpoint can READ
// data/dead-proxies.txt (it's part of the deployed bundle) to skip known-dead
// candidates, but it can't append to it or commit it back — only the GitHub
// Action (scripts/refresh.mjs) does that.
//
// Consequence: any proxy that dies for the first time *here* isn't recorded
// anywhere — it just gets retested on the next call to this endpoint, or on
// the next GitHub Action run, whichever comes first. That's the tradeoff for
// not touching Redis for dead-tracking. If that retesting cost bothers you,
// the fix is to stop calling this endpoint and rely on the GitHub Action
// alone (see README) rather than reintroducing a Redis dead set.

const MAX_QUEUE_SIZE = 6000;
const QUEUE_SIZE_STOP_THRESHOLD = 600;
const MAX_TEST_BATCH = 6000; // cap per-call work so this finishes well under the 60s function limit

export default async function handler(req, res) {
  if (req.headers["x-refresh-token"] !== process.env.REFRESH_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const start = Date.now();

  // Prevent two overlapping calls (e.g. cron-job.org firing twice close
  // together) from both fetching/testing the same batch at once. TTL is a
  // safety net in case a run crashes without releasing the lock.
  const gotLock = await redis.set(KEYS.REFRESH_LOCK, "1", { nx: true, ex: 55 });
  if (!gotLock) {
    return res.status(200).json({
      skipped: true,
      reason: "another refresh is already in progress",
      ms: Date.now() - start,
    });
  }

  try {
    const currentQueueSize = await redis.llen(KEYS.ALIVE_QUEUE);
    if (currentQueueSize >= QUEUE_SIZE_STOP_THRESHOLD) {
      return res.status(200).json({
        skipped: true,
        reason: `queue_size ${currentQueueSize} >= ${QUEUE_SIZE_STOP_THRESHOLD}`,
        queue_size: currentQueueSize,
        ms: Date.now() - start,
      });
    }

    const candidates = await fetchAllCandidates();

    const deadSet = loadDeadSet(); // from data/dead-proxies.txt, not Redis
    const aliveMembers = await redis.smembers(KEYS.ALIVE_SET);
    const aliveSet = new Set(aliveMembers);
    const fresh = candidates.filter((c) => {
      const key = `${c.protocol}|${c.addr}`;
      return !deadSet.has(key) && !aliveSet.has(key);
    });

    // Only test a bounded batch this call, to stay under Vercel's 60s function
    // timeout.
    const batch = fresh.slice(0, MAX_TEST_BATCH);

    const { alive, dead } = await testBatch(batch, 500);

    // Newly-dead ones are NOT written anywhere here (see note above) — just
    // counted for the response. They'll be retested next time.
    if (dead.length) {
      await redis.incrby(KEYS.DEAD_COUNT, dead.length);
    }

    let pushed = 0;
    for (const c of alive) {
      const key = `${c.protocol}|${c.addr}`;
      const added = await redis.sadd(KEYS.ALIVE_SET, key);
      if (added) {
        await redis.rpush(KEYS.ALIVE_QUEUE, JSON.stringify(c));
        pushed++;
      }
    }

    const len = await redis.llen(KEYS.ALIVE_QUEUE);
    if (len > MAX_QUEUE_SIZE) {
      const removed = await redis.lpop(KEYS.ALIVE_QUEUE, len - MAX_QUEUE_SIZE);
      if (removed) {
        for (const r of removed) {
          const c = typeof r === "string" ? JSON.parse(r) : r;
          await redis.srem(KEYS.ALIVE_SET, `${c.protocol}|${c.addr}`);
        }
      }
    }

    await redis.set(KEYS.LAST_RUN, new Date().toISOString());

    return res.status(200).json({
      candidates: candidates.length,
      fresh_remaining: fresh.length,
      tested_this_call: batch.length,
      newly_alive: alive.length,
      newly_dead: dead.length,
      pushed_to_queue: pushed,
      queue_size: await redis.llen(KEYS.ALIVE_QUEUE),
      ms: Date.now() - start,
    });
  } finally {
    await redis.del(KEYS.REFRESH_LOCK);
  }
}
