# 07 — Realtime: Socket.io Rooms, GPS Streaming, Outbox

## Gateway

`socketService.initialize(httpServer)` mounts Socket.io on the same port as the API (3000), fronted by Caddy with websocket upgrade. `pingInterval 5s / pingTimeout 10s` — dead connections reap fast on mobile networks.

**Auth:** `socket.handshake.auth.token` → same `authenticateToken` as tRPC → unauthorized sockets rejected at handshake.

**Horizontal scale:** `@socket.io/redis-adapter` (pub/sub) — any API replica can emit to any client. **Required in production** (`REDIS_URL` mandatory, throws otherwise).

## Room Topology

| Room | Members | Events |
|---|---|---|
| `user:<userId>` | auto-join on connect | personal notifications |
| `rider:<userId>` | auto for RIDER | `dispatch:offer` |
| `restaurant:<restaurantId>` | auto for RESTAURANT owner | `restaurant:new_order`, `restaurant:order_cancelled` |
| `order_tracking:<orderId>` | explicit `join:room`, **server-verified** (must be customer/rider/restaurant/admin of that order) | `order:status:update`, `order_tracking` (GPS) |

## GPS Streaming Pipeline (the scale-critical path)

```
Rider app (every 3s, foreground service)
  → rider:location:update
    → server: zod validate + reject isMocked + freshness ≤30s + accuracy ≤50m
    → server: rider must be online & own the orderId
    → Redis throttle lock gps:throttle:<rider> (3s) — floods dropped
    → Redis SET rider:loc:<rider> EX 30          ← hot path (no PG write)
    → every 30s (gps:snapshot lock): UPDATE rider_profiles.last_location  ← dispatch source of truth
    → in-memory emit to order_tracking:<orderId>  ← customer sees live pin
```

**Why:** 1,000 riders × 1 write/3s = 333 writes/s would hammer Postgres. Instead: Redis absorbs the stream, Postgres gets 0.03 writes/s per rider, customers still see real-time movement.

## Transactional Outbox

Problem: "commit order to DB" + "emit socket event" are not atomic — a crash between them loses the kitchen bell. Solution:

1. Business transaction `INSERT INTO realtime_outbox (room, event, payload)` in the same PG transaction.
2. `outboxWorker` polls every 1s: `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 100` → emit → `DELETE`.

Worst-case latency +1s; zero lost events, zero phantom events. Multiple API replicas poll safely (SKIP LOCKED).

## Event Catalog

| Event | Payload | Emitted when |
|---|---|---|
| `restaurant:new_order` | `{orderId, restaurantId, totalAmountPaise}` | payment captured (via outbox) |
| `order:status:update` | `{orderId, status, message?}` | every transition incl. cancel/refund |
| `dispatch:offer` | `{orderId, restaurant*, deliveryAddress, distanceKm, payoutPaise, expiresAt}` | 30s rider offer |
| `order_tracking` | `{orderId, riderLocation{lat,lng,heading,speed}}` | rider GPS tick |
| `restaurant:order_cancelled` | `{orderId, status}` | any cancellation |
