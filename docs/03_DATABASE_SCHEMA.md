# 03 — Database Schema & PostGIS Design

**PostgreSQL 16 + PostGIS 3.4**, self-hosted on the VPS (see doc 19). Migrations are plain SQL in `packages/database/src/migrations/`, applied in filename order.

## Migrations

| File | Contents |
|---|---|
| `0001_initial_schema.sql` | extensions, enums, core tables, indexes |
| `0002_production_guards.sql` | money/OTP CHECK constraints, unique partial indexes, `realtime_outbox`, RLS hardening |
| `0003_queue_and_integrity.sql` | settlement overlap guard, sweep indexes, `refund_events` audit table |

Apply manually: `psql $DATABASE_URL -f <file>` (compose auto-applies on first boot via `/docker-entrypoint-initdb.d`).

## Entity Map

```
users ──┬──< restaurants ──< dishes ──< dish_pair_associations
        │        │                │
        │        └──< orders >────┘ (via order_items)
        │               │
        ├──< rider_profiles (1:1, active_order_id → orders)
        └──< orders (customer_id)

settlements (entity_type RESTAURANT|RIDER → entity_id)
processed_webhooks (Razorpay idempotency)
realtime_outbox (transactional socket event relay)
refund_events (immutable refund audit)
```

## Key Tables & Design Decisions

### `orders` — the state machine anchor
- `status` is a PG enum mirroring `OrderStatus` in shared-types. Every transition is validated in code (`canTransitionOrder`) AND guarded by `UPDATE ... WHERE status = $expected` (optimistic concurrency).
- Money columns carry `CHECK` constraints: non-negative, and `order_total_matches` enforces the full Sec 9(5) equation — **the DB itself rejects arithmetic drift**.
- `delivery_otp` constrained to `^[0-9]{4}$`; `otp_attempts` capped 0–5.
- Partial unique index on `razorpay_payment_id` — one payment can never settle two orders.

### `restaurants` / `rider_profiles` — spatial entities
- `location GEOGRAPHY(POINT, 4326)` with **GiST index** → `ST_DWithin` radius queries use the index (sub-10ms at 100k rows).
- `rider_profiles.last_location` updated only every 30s from the socket GPS throttle (see doc 07) — the dispatch query filters `updated_at > NOW() - INTERVAL '60 seconds'` so stale riders are never offered orders.

### `dish_pair_associations` — co-occurrence matrix
- Powers "Frequently Bought Together" (`co_occurrence_count` ranking). Updated by a periodic aggregation job over `order_items` (see doc 20 for the refresh query).

### `processed_webhooks` — exactly-once payments
- `event_id PRIMARY KEY` + `INSERT ... ON CONFLICT DO NOTHING` inside the order-update transaction → webhook retries are idempotent, replays are impossible.

### `realtime_outbox` — the outbox pattern
- Business transaction writes event rows; `outboxWorker` polls every 1s (`FOR UPDATE SKIP LOCKED`), emits via Socket.io, deletes. If the API crashes mid-request, **no event is lost and none is emitted without its DB commit**.

### `settlements`
- Partial unique index `(entity_type, entity_id, start_date, end_date) WHERE status='PENDING'` prevents double-settlement even under concurrent admin clicks.

## Row-Level Security

Migration 0002 enables RLS on all tables and revokes `PUBLIC`/`anon`/`authenticated` grants. The API connects as the `bocardo` role and enforces authorization **in application code** (defense-in-depth: even if a Supabase-style REST surface is later exposed, tables are locked by default).

## Data Retention (recommended)

| Data | Keep | Mechanism |
|---|---|---|
| Orders, order_items | Forever (financial record) | — |
| `processed_webhooks` | 90 days | nightly `DELETE ... WHERE processed_at < NOW() - INTERVAL '90 days'` |
| `realtime_outbox` | deleted on emit | worker |
| `refund_events` | Forever (audit) | — |
| Redis GPS keys | 30s TTL | automatic |
