# 25 — Troubleshooting Runbook

## API / Backend

| Symptom | Likely cause | Fix |
|---|---|---|
| `api` container restart-looping | DB/Redis connection fail | `docker compose ... logs api`; verify passwords in `.env.production` match compose vars |
| 429s for legit users | rate limit too tight for polling screens | raise `RATE_LIMIT_MAX`, or move polling screens to sockets |
| tRPC 401 on real users | Clerk issuer/audience/key mismatch | re-check `CLERK_JWT_KEY` line breaks (`\\n`), `CLERK_ISSUER`, `CLERK_AUDIENCE` |
| Webhook 400 | wrong `RAZORPAY_WEBHOOK_SECRET` | resync both sides; check Razorpay retry log |
| Order stuck PAYMENT_PENDING (charged) | webhook missed | retry from Razorpay dashboard; check `processed_webhooks` for the event id |
| Kitchen never got the bell | outbox backlog | `SELECT COUNT(*) FROM realtime_outbox;` — if growing, `outboxWorker` crashed → restart api |
| Ghost timeout didn't refund | queue workers off | workers run only when `NODE_ENV=production` or `ENABLE_QUEUE_WORKERS=true`; check `BullMQ` boot log line |
| No rider offers going out | riders' GPS stale | `findNearestOnlineRider` needs `last_location` ≤60s old — check rider app foreground service; check Redis keys `rider:loc:*` |

## Database

| Symptom | Fix |
|---|---|
| `FATAL: remaining connection slots` | too many API replicas for pool math; lower `max` in `client.ts` or add PgBouncer |
| Slow nearby-restaurant queries | `EXPLAIN ANALYZE` — if seq scan, the GiST index didn't build; `CREATE INDEX CONCURRENTLY` |
| Disk filling | `docker system df`; `docker image prune -f`; check `pg_data` growth vs doc 20 thresholds |
| Migration conflict on boot | initdb scripts run **only on empty volume**; apply new migrations manually (doc 17) |

## Realtime / Mobile

| Symptom | Fix |
|---|---|
| Sockets connect then drop | corporate/proxy interference — Socket.io falls back to long-polling automatically; verify Caddy websocket block intact |
| Rider GPS rejected | mock location app running / accuracy >50m indoors — expected; have rider step outside |
| "Delivery OTP invalid" loop | 5-attempt cap hit → contact support path; verify customer is reading the OTP from the active order card |
| App shows old API URL | env is baked at build time — rebuild APK with correct `EXPO_PUBLIC_API_URL` (doc 21) |
| KOT not printing | check printer SQLite queue replays on reconnect; "Reprint Duplicate KOT" button; paper |

## Edge / TLS

| Symptom | Fix |
|---|---|
| Cert not issuing | DNS not propagated or 80/443 blocked at VPC; `docker compose ... logs caddy` |
| 502 from Caddy | upstream down or mid-rolling-restart; `docker compose ... ps` and retry in 10s |

## Emergency Contacts Template

Keep an internal page with: GCP project id, VPS name/zone, Razorpay dashboard owner, Clerk instance owner, DB password location (vault), and this runbook URL.
