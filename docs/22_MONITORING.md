# 22 — Monitoring, Logging & Alerting

## What Exists Today

- **Fastify structured logs** (JSON, info-level in prod) with per-request `X-Request-Id` correlation.
- **Slow query logs**: Postgres `log_min_duration_statement=500` + API dev-mode warnings.
- **Health endpoints**: `/health` (API) + compose healthchecks on postgres/redis.
- **Queue failure logs**: BullMQ `failed` listeners on every worker.

## Logs on the VPS

```bash
docker compose -f docker-compose.prod.yml logs -f --tail=200 api
docker compose -f docker-compose.prod.yml logs -f postgres | grep duration
tail -f /var/lib/docker/volumes/bocardo_caddy_data/_data/access-api.log | jq .   # edge access log
```

Add log rotation (host): `/etc/docker/daemon.json` → `{ "log-driver": "json-file", "log-opts": { "max-size": "50m", "max-file": "5" } }` then `systemctl restart docker`.

## Alerting (pragmatic, free)

**Option A — Uptime Kuma (recommended for launch):** add to compose, monitor `https://api.<domain>/health`, `https://admin.<domain>`, TCP 443; alerts to Telegram/Slack/email. Self-hosted, 5 minutes to set up.

**Option B — GCP Cloud Monitoring:** VM metrics (CPU/disk) + uptime checks hitting `/health` from 3 regions; alert policies → email/SMS. Cost: free tier covers it.

## Metrics Worth Graphing (Prometheus roadmap)

When you add `fastify-metrics` + a small Prometheus+Grafana compose overlay:
- tRPC latency p50/p95/p99 per procedure
- `order.create` rate + error rate (launch health KPI)
- BullMQ: waiting/failed counts per queue
- Socket.io: connected clients, GPS msgs/sec
- Node: event loop lag, heap
- Postgres: connections, TPS, cache hit ratio (target >99%), replication n/a (single node)

## Error Tracking

Add Sentry (self-hosted is heavy — use the cloud free tier):
- API: `@sentry/node` with `beforeSend` scrubbing `authorization` headers.
- Mobile: `sentry-expo` per app, sourcemaps uploaded in EAS builds.

## Alert Thresholds That Matter

| Alert | Threshold | Why |
|---|---|---|
| /health down | 2 consecutive | revenue stops |
| BullMQ failed jobs | >5 in 10 min | refunds/dispatch failing |
| Ghost-restaurant triggers | >10/day | supply quality problem, not tech |
| VPS disk | >75% | postgres growth |
| Cert expiry | Caddy handles; alert if renewal log errors | TLS outage |
