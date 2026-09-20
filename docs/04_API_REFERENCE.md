# 04 — API Reference (tRPC Routers & Webhooks)

Base URL: `https://api.<domain>/trpc` · Auth: `Authorization: Bearer <Clerk JWT>` · Errors: standard tRPC error envelope with `code`.

## `auth`
| Procedure | Type | Guard | Description |
|---|---|---|---|
| `auth.me` | query | protected | Current user profile incl. role, suspension, restaurantId |
| `auth.health` | query | public | Liveness probe |

## `restaurant`
| Procedure | Guard | Description |
|---|---|---|
| `restaurant.listNearby` | public | PostGIS radius search. Input: `latitude/longitude` (bounded ±90/±180), `radiusMeters` (500–15000, default 7000). Returns distance-sorted restaurants. |
| `restaurant.getById` | public | Restaurant + full menu ordered by category. 404 if missing. |
| `restaurant.search` | public | Ranked ILIKE search (restaurant > dish > cuisine), optional 10km geo filter. `query` 2–80 chars, `limit` ≤ 30. |
| `restaurant.toggleAcceptingOrders` | RESTAURANT/ADMIN | Open/close kitchen. BOLA-checked against `restaurantId`. |
| `restaurant.toggleDishAvailability` | RESTAURANT/ADMIN | 86 a dish instantly. Ownership-checked. |

## `order`
| Procedure | Guard | Description |
|---|---|---|
| `order.create` | CUSTOMER | Hardened checkout: Redis cart lock (8s), live DB price validation (rejects tampered totals), 86-check, Sec 9(5) tax math, crypto OTP, `PAYMENT_PENDING` insert + Razorpay order, ghost-restaurant check scheduled. Returns `{ orderId, razorpayOrderId, totalAmountPaise, deliveryOtp, taxBreakdown }`. |
| `order.getById` | protected | Multi-tenant: customer sees own; restaurant sees own (OTP masked `****`); rider sees assigned only; phones masked by role. |
| `order.updateStatus` | protected | State machine transitions (`canTransitionOrder`), optimistic `WHERE status = $current` guard, triggers dispatch at `READY_FOR_PICKUP`, broadcasts status. |
| `order.cancelOrder` | CUSTOMER/RESTAURANT/ADMIN | Role-gated windows (customer: PAID only; kitchen: until PREPARING; admin: pre-delivery). Atomic cancel + full Razorpay refund + rider release + socket notify. Audit row in `refund_events`. |
| `order.verifyDeliveryOtp` | RIDER | Anti-fraud delivery close: requires fresh (≤30s) GPS ≤50m accuracy, within 100m geofence of drop point, ≤5 attempts (DB-enforced), then `DELIVERED` + rider release. |
| `order.listMyOrders` | protected | Customer order history (latest 20, incl. OTP for active). |
| `order.listRestaurantOrders` | protected (RESTAURANT) | Live KOT feed (non-cancelled, latest 50). |

## `rider`
| Procedure | Guard | Description |
|---|---|---|
| `rider.getProfile` | RIDER/ADMIN | Duty status + active order; auto-provisions profile |
| `rider.toggleDuty` | RIDER/ADMIN | Go online/offline |
| `rider.respondToDispatchOffer` | RIDER/ADMIN | Accept/decline a 30s offer; only the current candidate's response is honored |

## `recommendations`
| Procedure | Guard | Description |
|---|---|---|
| `recommendations.orderItAgain` | protected | Top re-orders from DELIVERED history; Redis-cached 1h |
| `recommendations.mealTimeCravings` | public | Slot-aware dishes (BREAKFAST/LUNCH/SNACKS/DINNER/LATE_NIGHT) |
| `recommendations.trendingNearYou` | public | PostGIS 5km trending, geo-grid Redis cache 20min |
| `recommendations.frequentlyBoughtTogether` | public | Co-occurrence upsell, ≤25 input dishes |

## `settlement`
| Procedure | Guard | Description |
|---|---|---|
| `settlement.listSettlements` | ADMIN/RESTAURANT | Filterable ledger; restaurants see only their own |
| `settlement.generateWeeklyLedger` | ADMIN | 7-day aggregation → PENDING settlement rows (overlap-guarded by DB) |
| `settlement.exportBankTransferCsv` | ADMIN | Corporate net-banking batch CSV (HDFC/ICICI format) |
| `settlement.reconcileWithUtr` | ADMIN | Mark PAID with bank UTR reference |

## REST Endpoints (non-tRPC)

| Route | Purpose |
|---|---|
| `GET /health` | LB/compose healthcheck |
| `POST /webhooks/razorpay` | Raw-body, HMAC-SHA256 verified (`x-razorpay-signature` + `x-razorpay-event-id`). Handles `payment.captured` (idempotent PAID transition + outbox event) and `payment.failed` (auto-cancel). 256KB body limit. |

## Rate Limits
Global: **300 req/min per user-token (or IP when anonymous)** via `@fastify/rate-limit`, 429 with `Retry-After`. OTP brute-force is additionally capped by the DB `otp_attempts ≤ 5` guard.
