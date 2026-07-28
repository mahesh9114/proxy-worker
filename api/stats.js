import { redis, KEYS } from "../lib/redis.js";

export default async function handler(req, res) {
  const [queue_size, dead_count, last_run] = await Promise.all([
    redis.llen(KEYS.ALIVE_QUEUE),
    redis.get(KEYS.DEAD_COUNT),
    redis.get(KEYS.LAST_RUN),
  ]);

  return res
    .status(200)
    .json({ queue_size, dead_count: Number(dead_count) || 0, last_run });
}
