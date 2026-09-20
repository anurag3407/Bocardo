# 05 — Authentication & RBAC Security Model

## Identity: Clerk (JWT RS256)

1. App obtains a Clerk session JWT.
2. Every tRPC call & socket handshake sends `Authorization: Bearer <jwt>`.
3. `context.ts` verifies signature with `CLERK_JWT_KEY` (RS256) + `issuer` + `audience`.
4. **JIT upsert** into `users` (on conflict: refresh email/phone/name, **never downgrade role**).

### Role Assignment — Trust Boundaries

> ⚠️ Roles are **never** read from Clerk `publicMetadata` (client-writable → privilege escalation). 

Resolution order in `authenticateToken`:
1. `PRIVILEGED_ROLES` env allowlist (`email:ROLE` pairs, server-managed) → upserted to DB.
2. Existing DB `users.role` (set by an admin out-of-band, e.g. restaurant owner onboarding).
3. Default `CUSTOMER`.

Dev escape hatch: `ALLOW_MOCK_AUTH=true` + `mock_token_<role>` tokens, **development only**.

## Authorization Layers

| Layer | Mechanism | Example |
|---|---|---|
| Procedure guard | `protectedProcedure` / `roleProtectedProcedure(...roles)` | Rider can't call kitchen endpoints |
| Row ownership (BOLA) | Explicit `WHERE owner = $ctx.user.id` checks | `order.getById` per-role scoping |
| Data masking | Server-side field filtering | Rider/restaurant see `+91 98*** **210`; OTP `****` for non-customers |
| Socket rooms | Server-verified membership on `join:room` | Can only join `order_tracking:<id>` if party to the order |
| DB floor | RLS enabled, PUBLIC revoked | Even a leaked connection string surface is empty |
| Suspension | `is_suspended` → auth null + 403 | Kill-switch per user |

## Anti-Fraud Controls

| Fraud | Control |
|---|---|
| Fake GPS (rider) | `GpsCoordinateSchema` rejects `isMocked`, accuracy >50m, stale >30s, speed >120km/h |
| Fake delivery | 4-digit OTP, ≤5 attempts (DB CHECK + atomic increment), 100m geofence at drop |
| Ghost restaurant | 120s BullMQ timeout → auto-refund + restaurant forced offline |
| Double checkout | Redis `SET NX` cart lock per user |
| Webhook replay | `processed_webhooks` PK + HMAC timing-safe compare |
| Double payment settle | Partial unique index on `razorpay_payment_id` |
| Rider hoarding orders | Partial unique index: one `active_order_id` per rider; order assigned to one rider |
| Double settlement | Unique `(entity, period)` partial index on PENDING settlements |
| Tampered cart prices | Server recomputes from live `dishes` table; client totals ignored |
| Rider abandons order | 2h reaper → release + auto-redispatch |

## Transport & Edge

- TLS everywhere (Caddy auto-HTTPS, HSTS preload), security headers set at edge.
- CORS locked to `ALLOWED_ORIGINS`; credentials allowed only for those origins.
- Rate limit: 300 req/min per token/IP; webhook route body-capped at 256KB.
- Secrets only in `.env.production` (chmod 600) on the VPS; never in git. Clerk/Razorpay live keys distinct from test.

## Secret Inventory & Rotation

| Secret | Where | Rotation |
|---|---|---|
| `POSTGRES_PASSWORD` | VPS env | Quarterly; update compose + redeploy |
| `REDIS_PASSWORD` | VPS env | Quarterly |
| `CLERK_*` | VPS env + Clerk dashboard | On suspicion; rotate JWT key pair |
| `RAZORPAY_*` | VPS env + Razorpay dashboard | On suspicion; **webhook secret rotation requires updating the dashboard simultaneously** |
| `PRIVILEGED_ROLES` | VPS env | On staff change |
