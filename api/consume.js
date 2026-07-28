import { redis, KEYS } from "../lib/redis.js";

export default async function handler(req, res) {
  if (req.headers["x-refresh-token"] !== process.env.REFRESH_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const count = Math.min(parseInt(req.query.count || "1", 10), 500);

  const items = await redis.lpop(KEYS.ALIVE_QUEUE, count);
  const proxies = (items || []).map((i) => JSON.parse(i));

  // Remove from the dedupe guard so they can be re-queued in a future refresh
  // if they get tested alive again (they've now left the ready queue).
  if (proxies.length) {
    await redis.srem(
      KEYS.ALIVE_SET,
      ...proxies.map((c) => `${c.protocol}|${c.addr}`)
    );
  }

  return res.status(200).json({ count: proxies.length, proxies });
}
