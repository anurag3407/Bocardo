# 08 — Order Lifecycle & Rider Dispatch Engine

## State Machine

```
PAYMENT_PENDING ──webhook──► PAID ──kitchen──► ACCEPTED_BY_KITCHEN ──► PREPARING
     │                        │                                        │
     │ (fail/sweep/           │ (120s ghost timeout /                  ▼
     │  customer cancel)      │  customer/kitchen cancel)      READY_FOR_PICKUP
     ▼                        ▼                                        │ dispatch
CANCELLED_* (refund if paid) ◄─┘                                       ▼
                                                              RIDER_ASSIGNED ──► OUT_FOR_DELIVERY
                                                                                      │ OTP+geofence
                                                                                      ▼
                                                                                  DELIVERED
```

Transitions are validated by `canTransitionOrder(role, current, next)` **and** an atomic `UPDATE ... WHERE status = current` (a stale app UI can never double-advance an order).

## Cancellation Windows & Refunds

| Actor | Can cancel when | Refund |
|---|---|---|
| Customer | status = PAID (kitchen hasn't accepted) | Full, instant |
| Kitchen | PAID → PREPARING | Full, instant |
| Admin | anything pre-DELIVERED | Full, instant |
| System | ghost timeout, payment failed/abandoned | Full (if captured) |

All paths: atomic status guard → release rider → Razorpay refund → `refund_events` audit → socket notify.

## Sequential 1-to-1 Dispatch (Swiggy-style)

1. Kitchen marks `READY_FOR_PICKUP` → `dispatchNextRider(orderId)` enqueues a BullMQ job.
2. Worker loads dispatch state from **Redis** (`dispatch:state:<orderId>`: rejected riders, current candidate, attempt#) — survives restarts/replicas.
3. PostGIS picks the **single nearest** online rider within 4km (`last_location` fresh ≤60s, no active order, not suspended, not already rejected).
4. Rider gets a 30s `dispatch:offer` with payout ₹ and addresses.
5. Outcomes:
   - **Accept** → atomic `UPDATE orders SET rider_id ... WHERE rider_id IS NULL` + rider `active_order_id` set + tracking broadcast.
   - **Decline/timeout** → candidate added to rejected list → next nearest offered. Timeout jobs carry the candidate id, so a job that fires after a response **no-ops** (no double-cascade bug).
   - **No riders** → re-enqueue with 15s backoff, up to 20 attempts → ops escalation message.

## Anti-Abandonment Reaper

BullMQ repeat job (15 min): orders in `RIDER_ASSIGNED`/`OUT_FOR_DELIVERY` untouched >2h → rider released, status back to `READY_FOR_PICKUP`, dispatch restarts, customer notified. This closes the "rider went home with your biryani" hole.

## Delivery Close (Anti-Fraud)

`verifyDeliveryOtp` requires ALL of:
1. Rider assigned to this order, status `OUT_FOR_DELIVERY`.
2. Fresh Redis GPS (≤30s, accuracy ≤50m, non-mocked).
3. `ST_DWithin(delivery_location, rider, 100m)` — physical presence at the door.
4. Correct 4-digit OTP within 5 attempts (atomic DB increment + CHECK cap).

Only then: `DELIVERED` + `delivered_at` + rider freed for the next order.
