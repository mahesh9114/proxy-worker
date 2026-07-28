// Run directly by the GitHub Action (not an HTTP endpoint). This has two
// advantages over calling a Vercel function: it can commit the dead-list
// file back to the repo, and it isn't bound by Vercel's function duration
// limits, so testing thousands of candidates is comfortable.
import { redis, KEYS } from "../lib/redis.js";
import { fetchAllCandidates } from "../lib/sources.js";
import { testBatch } from "../lib/test-proxy.js";
import { loadDeadSet, appendDead } from "../lib/dead-store.js";

const MAX_QUEUE_SIZE = 6000; // headroom above the ~2800 serving target

async function main() {
  const start = Date.now();

  console.error("Fetching candidate lists...");
  const candidates = await fetchAllCandidates();
  console.error(`Fetched ${candidates.length} candidates.`);

  // Skip proxies already known dead (from the repo log, not Redis).
  const deadSet = loadDeadSet();
  const fresh = candidates.filter(
    (c) => !deadSet.has(`${c.protocol}|${c.addr}`),
  );
  console.error(`${fresh.length} are new (not in dead log). Testing...`);

  const { alive, dead } = await testBatch(fresh, 200);
  console.error(`Done testing: ${alive.length} alive, ${dead.length} dead.`);

  // Append newly-dead ones to the repo log so they're never retested again.
  // (The workflow commits this file after the script exits.)
  if (dead.length) {
    appendDead(dead.map((c) => `${c.protocol}|${c.addr}`));
    await redis.incrby(KEYS.DEAD_COUNT, dead.length);
  }

  // Push alive ones into the serving queue, deduped against what's already queued.
  let pushed = 0;
  for (const c of alive) {
    const key = `${c.protocol}|${c.addr}`;
    const added = await redis.sadd(KEYS.ALIVE_SET, key);
    if (added) {
      await redis.rpush(KEYS.ALIVE_QUEUE, JSON.stringify(c));
      pushed++;
    }
  }

  // Trim queue so it doesn't grow forever (oldest entries drop off).
  const len = await redis.llen(KEYS.ALIVE_QUEUE);
  if (len > MAX_QUEUE_SIZE) {
    const removed = await redis.lpop(KEYS.ALIVE_QUEUE, len - MAX_QUEUE_SIZE);
    if (removed) {
      for (const r of removed) {
        const c = JSON.parse(r);
        await redis.srem(KEYS.ALIVE_SET, `${c.protocol}|${c.addr}`);
      }
    }
  }

  await redis.set(KEYS.LAST_RUN, new Date().toISOString());

  const summary = {
    candidates: candidates.length,
    tested: fresh.length,
    skipped_known_dead: candidates.length - fresh.length,
    newly_alive: alive.length,
    newly_dead: dead.length,
    pushed_to_queue: pushed,
    queue_size: await redis.llen(KEYS.ALIVE_QUEUE),
    ms: Date.now() - start,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
