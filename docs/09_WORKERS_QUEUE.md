# 09 — BullMQ Durable Workers & Scheduled Jobs

## Why Queues (and why not setTimeout)

The original design used in-memory `setTimeout` + `Map` for the ghost-restaurant timeout and dispatch cascade. **Any deploy or crash silently voided those timers** — paid orders would sit un-refunded and undispatched. BullMQ on Redis gives: persistence, retries with exponential backoff, delayed jobs, repeatable (cron) jobs, and multi-replica safety.

## Queues (`apps/api/src/services/queue.ts`)

| Queue | Jobs | Schedule |
|---|---|---|
| `order-lifecycle` | `ghost-restaurant-check` (delay 120s, deduped by orderId) · `stale-payment-sweep` (every 10 min) · `rider-abandon-sweep` (every 15 min) | delayed / repeatable |
| `rider-dispatch` | `dispatch-next-rider` (immediate, +15s no-rider retry, +30s offer timeout) | delayed |

Job defaults: `attempts: 5`, exponential backoff from 2s, capped retention (`removeOnComplete: 500`).

## Workers

Started in `server.ts` when `NODE_ENV=production` or `ENABLE_QUEUE_WORKERS=true`:

- `startQueueWorkers()` — lifecycle processor + registers the two repeatable sweeps (stable jobIds → idempotent across restarts/replicas).
- `startDispatchWorker()` — dispatch processor (concurrency 10).
- `startOutboxWorker()` — 1s poll of `realtime_outbox` (not BullMQ: it must run against PG directly).

## Operational Commands

```bash
# Redis-backed queue introspection (on the VPS)
docker compose -f docker-compose.prod.yml exec redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning KEYS 'bull:*'

# Failed jobs
docker compose -f docker-compose.prod.yml exec redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning LRANGE bull:order-lifecycle:failed 0 -1
```

Optional: add **bull-board** as an internal-only route behind admin auth for a visual queue dashboard (planned; see doc 24 backlog).

## Failure Modes

| Failure | Behavior |
|---|---|
| Redis down at enqueue | Dev: ghost check logs warning; dispatch `dispatchNextRider` catches & logs. Prod: **fix Redis immediately** — it is the queue + cache + socket backbone. Redis AOF persistence is enabled so a restart loses ≤1s of writes. |
| Job throws (e.g. Razorpay 500 during refund) | Retried 5× with backoff → lands in failed set → alert via logs (see doc 22) |
| API replica count > 1 | Safe: BullMQ workers are competing consumers; outbox uses SKIP LOCKED; repeatable jobs dedupe by jobId |
