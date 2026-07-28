import { redis, KEYS } from "../lib/redis.js";
import { fetchAllCandidates } from "../lib/sources.js";
import { testBatch } from "../lib/test-proxy.js";

// Vercel functions have no persistent disk / git access, so unlike
// scripts/refresh.mjs (run by GitHub Actions), this endpoint stores the
// dead-proxy log in Redis instead of committing data/dead-proxies.txt.
// KEYS.DEAD_SET must exist in lib/redis.js (see note below).

const MAX_QUEUE_SIZE = 6000;
const QUEUE_SIZE_STOP_THRESHOLD = 600;

export default async function handler(req, res) {
  if (req.headers["x-refresh-token"] !== process.env.REFRESH_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const start = Date.now();

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

  // Dead set now lives in Redis (KEYS.DEAD_SET), not a committed file.
  const deadSet = new Set(await redis.smembers(KEYS.DEAD_SET));
  const fresh = candidates.filter(
    (c) => !deadSet.has(`${c.protocol}|${c.addr}`),
  );

  const { alive, dead } = await testBatch(fresh, 200);

  if (dead.length) {
    const deadKeys = dead.map((c) => `${c.protocol}|${c.addr}`);
    await redis.sadd(KEYS.DEAD_SET, ...deadKeys);
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
    tested: fresh.length,
    skipped_known_dead: candidates.length - fresh.length,
    newly_alive: alive.length,
    newly_dead: dead.length,
    pushed_to_queue: pushed,
    queue_size: await redis.llen(KEYS.ALIVE_QUEUE),
    ms: Date.now() - start,
  });
}
