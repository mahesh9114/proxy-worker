// Run directly by the GitHub Action (not an HTTP endpoint). This has two
// advantages over calling a Vercel function: it can commit the dead-list
// file back to the repo, and it isn't bound by Vercel's function duration
// limits, so testing thousands of candidates is comfortable.
import { redis, KEYS } from "../lib/redis.js";
import { fetchAllCandidates } from "../lib/sources.js";
import { testBatch } from "../lib/test-proxy.js";
import { loadDeadSet, appendDead } from "../lib/dead-store.js";

const MAX_QUEUE_SIZE = 6000; // headroom above the ~2800 serving target
const QUEUE_SIZE_STOP_THRESHOLD = 600; // if queue already has this many, skip the run
const MAX_TEST_BATCH = 5000; // cap per-run work so one run doesn't take hours

async function main() {
  const start = Date.now();

  // If the queue is already sufficiently full, skip fetching/testing entirely.
  const currentQueueSize = await redis.llen(KEYS.ALIVE_QUEUE);
  if (currentQueueSize >= QUEUE_SIZE_STOP_THRESHOLD) {
    console.error(
      `Queue size (${currentQueueSize}) >= threshold (${QUEUE_SIZE_STOP_THRESHOLD}). Skipping this run.`,
    );
    const summary = {
      skipped: true,
      reason: `queue_size ${currentQueueSize} >= ${QUEUE_SIZE_STOP_THRESHOLD}`,
      queue_size: currentQueueSize,
      ms: Date.now() - start,
    };
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.error("Fetching candidate lists...");
  const candidates = await fetchAllCandidates();
  console.error(`Fetched ${candidates.length} candidates.`);

  // Skip proxies already known dead (from the repo log, not Redis) or
  // already alive-and-queued (no need to retest until consumed).
  const deadSet = loadDeadSet();
  const aliveMembers = await redis.smembers(KEYS.ALIVE_SET);
  const aliveSet = new Set(aliveMembers);
  const fresh = candidates.filter((c) => {
    const key = `${c.protocol}|${c.addr}`;
    return !deadSet.has(key) && !aliveSet.has(key);
  });
  console.error(`${fresh.length} are new (not dead, not already queued).`);

  // Cap how many we test in a single run. With this many sources, `fresh`
  // can be hundreds of thousands of candidates on a big backlog — testing
  // all of them in one go can take hours. Newly-dead ones get appended to
  // data/dead-proxies.txt and committed at the end of this run, so next
  // run's `fresh` naturally excludes them and the batch slides forward
  // through the backlog over successive runs.
  const batch = fresh.slice(0, MAX_TEST_BATCH);
  console.error(`Testing ${batch.length} of ${fresh.length}...`);

  const { alive, dead } = await testBatch(batch, 800);
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
    fresh_remaining: fresh.length,
    tested_this_run: batch.length,
    skipped_known_dead_or_alive: candidates.length - fresh.length,
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
