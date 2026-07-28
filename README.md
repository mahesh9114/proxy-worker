# proxy-worker

=======

Pulls free proxies from ~7 GitHub-hosted lists (updated every 5-30 min upstream),
tests each for liveness, pushes alive ones into a Redis queue, and permanently
logs dead ones to a file in this repo so they're never retested. Free to run forever.

## Architecture

- `scripts/refresh.mjs` — the fetch/test/queue cycle. Run directly by the
  GitHub Action on a schedule (not an HTTP endpoint).
- `data/dead-proxies.txt` — append-only log of dead `protocol|ip:port` entries,
  committed back to the repo by the Action after every run. **This is the only
  place dead proxies are stored** — never in Redis, so Redis usage stays flat
  no matter how long this runs.
- `api/consume.js` — pop N proxies off the ready queue (what your scraper/worker calls).
- `api/stats.js` — queue size, dead-log count, last refresh time.
- Redis (Upstash free tier) holds only: `proxy:alive:queue` (list, size-capped),
  `proxy:alive:set` (dedupe guard, bounded to whatever's in the queue), and two
  tiny scalar keys for `last_run` / `dead_count`. Nothing in Redis grows without limit.

## Why the Action runs refresh directly (not via Vercel)

Two reasons:

1. Vercel's free (Hobby) plan only allows cron jobs to run once a day, and
   serverless functions there can't `git commit` back to the repo anyway.
2. GitHub Actions runners get a full git checkout and free, generous run
   time, so `scripts/refresh.mjs` can test candidates and then commit
   `data/dead-proxies.txt` in the same job — no extra plumbing needed.

Vercel is only used to _serve_ proxies (`/api/consume`, `/api/stats`), not to
refresh them.

## Setup

1. Create a free Redis DB at https://upstash.com (Redis > Create Database).
   Copy the REST URL + token.
2. `vercel deploy` this repo (or connect the GitHub repo in the Vercel dashboard).
3. In Vercel project settings > Environment Variables, set:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   - `REFRESH_TOKEN` (any long random string — protects `/api/consume`)
4. In your GitHub repo settings > Secrets and variables > Actions, set:
   - `UPSTASH_REDIS_REST_URL` = same value as step 3
   - `UPSTASH_REDIS_REST_TOKEN` = same value as step 3
5. Push to GitHub. The Action starts firing every 5 minutes automatically,
   testing proxies and committing newly-dead ones to `data/dead-proxies.txt`.
6. Trigger it once manually (Actions tab > Run workflow) to fill the queue
   before waiting on the schedule.

Because the Action pushes a commit every ~5 minutes, `vercel.json` sets
`ignoreCommand` so Vercel skips a redeploy when the only change is to
`data/dead-proxies.txt`. If you fork/restructure this, keep that in mind or
you'll rack up a deploy every 5 minutes.

## Consuming proxies

```
curl -X POST "https://your-project.vercel.app/api/consume?count=50" \
  -H "x-refresh-token: YOUR_REFRESH_TOKEN"
```

Returns `{ count, proxies: [{ addr, protocol }, ...] }`. Consumed proxies leave
the queue (pop, not peek) — have your worker return unused-but-still-good ones
via a re-push if you want, or just let the next refresh cycle backfill.

## Known limitation (by design, kept simple per scope)

Once a proxy is marked alive and queued, it isn't re-tested until it's consumed
— a small fraction may go stale between being queued and being pulled. If you
want stricter freshness, lower `MAX_QUEUE_SIZE` in `scripts/refresh.mjs` so the
queue turns over faster, or add a re-test pass before handing a proxy out in
`consume.js`.

`data/dead-proxies.txt` grows forever by design (that's the point — a proxy
that's dead once is essentially never worth retesting). It's plain text so it
compresses extremely well in git; if it ever gets unwieldy you can prune
entries older than some cutoff, but there's no requirement to.

## Sources used (edit `lib/sources.js` to add/remove)

- proxifly/free-proxy-list (5 min)
- proxyscrape/free-proxy-list (5 min)
- databay-labs/free-proxy-list (5 min)
- dpangestuw/Free-Proxy (5 min)
- iplocate/free-proxy-list (30 min)
- TheSpeedX/PROXY-List
- monosans/proxy-list (hourly)
  > > > > > > > 983b1dd (initial commit)
