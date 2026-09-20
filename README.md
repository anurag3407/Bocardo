# Bocardo Monorepo: 4-App Food Delivery Platform (Production-Hardened)

A production-grade, multi-platform food ordering ecosystem engineered with **Turborepo**, **pnpm workspaces**, **Expo SDK 51+**, **Next.js 14**, and **Fastify + tRPC v11**. Fully compliant with Indian Tax Laws (**Section 9(5) CGST dual-tax**) and designed with anti-fraud safeguards (**Delivery Handover OTP**, **Mock GPS Rejection**, and **Ghost Restaurant 120s Auto-Refund**).

---

## 🏗️ Monorepo Architecture

```
Bocardo/
├── apps/
│   ├── customer/            # Expo SDK 51+ (iOS, Android, Web PWA)
│   ├── hotel/               # Expo SDK 51+ (Android Tablet & Phone - KOT & ESC/POS)
│   ├── rider/               # Expo SDK 51+ (Android Phone - Foreground GPS & OTP)
│   ├── admin/               # Next.js 14+ App Router (Desktop Ops & Settlement Dashboard)
│   └── api/                 # Fastify + tRPC v11 + Socket.io + BullMQ + Redis
├── packages/
│   ├── shared-types/        # Zod validation schemas, state machines, DTOs, Sec 9(5) math
│   ├── database/            # Supabase PostgreSQL 16 + PostGIS migrations & spatial queries
│   ├── api-client/          # tRPC client & React Query hooks
│   ├── ui/                  # NativeWind / Tailwind styling & reusable components
│   ├── typescript-config/   # Shared tsconfig base files
│   └── eslint-config/       # Unified ESLint configurations
├── docs/
│   └── swiggy_zomato_flow_analysis.md # Comprehensive industry flow teardown
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

---

## 🎯 Swiggy & Zomato Feature Parity

### 1. Customer Application (`apps/customer`)
* **Contextual Meal Cravings:** Dynamic banner reflecting active Indian meal hours (Breakfast: 6-11am | Lunch: 11am-4pm | Snacks: 4-7pm | Dinner: 7-11pm | Late Night: 11pm-6am).
* **Hyperlocal PostGIS Discovery:** 5km radius filtering with Redis geogrid caching.
* **Co-Occurrence Cart Upsell:** "Frequently Bought Together" tray (e.g. Biryani -> Raita & Gulab Jamun).
* **Delivery Tip Chips:** Quick ₹20, ₹30, ₹50 partner tip selection.
* **Delivery Handover OTP Card:** Prominently displays the 4-digit code customer must share at the doorstep.
* **Live Rider Tracking:** Pulsing animated marker with simulated route updates.

### 2. Hotel Partner Tablet App (`apps/hotel`)
* **Live KOT (Kitchen Order Ticket) Board:** 4 columns: Incoming, Preparing, Ready for Pickup, Dispatched.
* **High-Volume Persistent Alarm:** Audio loop on `STREAM_ALARM` channel that rings until staff taps "Accept Order".
* **120-Second Ghost Restaurant Safeguard:** Visual ticking countdown that triggers auto-cancellation and refund if ignored.
* **ESC/POS Thermal Printing Queue:** Auto-formats 58mm/80mm KOT tickets upon acceptance with local SQLite queue and "Reprint Duplicate KOT" button.
* **Kitchen 86-ing:** Fast toggle to instantly 86 (mark out-of-stock) any dish.

### 3. Delivery Rider App (`apps/rider`)
* **Shift Management:** Go Online / Go Offline duty toggle.
* **Sequential 1-to-1 Dispatch:** 30-second ticking countdown offer modal with payout in ₹; auto-cascades to next nearest rider if declined or timed out.
* **Anti-Cheat Mock GPS Rejection:** Verifies real hardware GPS and rejects spoofed coordinates (`isMocked === true`).
* **Foreground GPS Streaming:** Telemetry streamed every 3 seconds to Redis/Socket.io (zero continuous disk writes to PostgreSQL).
* **Delivery Handover OTP Guard:** Rider cannot tap "DELIVERED" without entering customer's 4-digit code.
* **Customer Phone Masking:** Phone numbers are masked (`+91 98*** **210`) to protect customer privacy.

### 4. Admin Operations & Settlement Portal (`apps/admin`)
* **Live City Map:** Real-time visualizer of active riders, orders, and restaurants in Bangalore.
* **Restaurant Onboarding:** GSTIN compliance check and commission rate configuration (default 15%).
* **Section 9(5) CGST Dual-Tax Reconciliation:** Explicit audit separating Restaurant Food GST (5%) from Platform Service GST (18%).
* **Weekly Offline Settlement Ledger:** Calculates $\text{Net Payout} = \text{Subtotal} - \text{Commission (15\%)} - \text{Refunds}$.
* **Corporate Net Banking CSV Export:** One-click batch download formatted for HDFC / ICICI Net Banking.
* **UTR Reconciliation Modal:** Input bank UTR reference numbers to mark records `PAID`.

---

## 🛡️ Production Hardening (v1.1)

| Layer | Before | Now |
|---|---|---|
| **Ghost Restaurant timeout** | In-memory `setTimeout` (lost on restart) | Durable **BullMQ delayed job** with retries |
| **Rider dispatch cascade** | In-memory `Map` + timers | **Redis-backed state + BullMQ** queue; stale-offer jobs no-op via candidate tokens; auto reassignment if rider abandons (2h reaper) |
| **Abandoned checkouts** | Orphaned `PAYMENT_PENDING` rows forever | `payment.failed` webhook handler + 10-min stale sweeper |
| **Cancellations** | Customer cancel impossible; kitchen cancel kept the money | `order.cancelOrder` with role-gated windows + **full Razorpay refund** + refund audit trail |
| **Rate limiting** | None | `@fastify/rate-limit` global (300 req/min, per user-token/IP) |
| **RBAC** | Role read from client-writable Clerk `publicMetadata` | Role from **DB + server-side `PRIVILEGED_ROLES` allowlist** only |
| **Input hardening** | Unbounded radius/limit/arrays | Strict zod bounds on all public geo/search endpoints |
| **Settlement integrity** | Double-settle possible | Unique partial index blocks overlapping PENDING settlements |
| **Observability** | None | `X-Request-Id` correlation IDs, graceful shutdown of HTTP + queues + PG pool |

Run the queue workers locally with `ENABLE_QUEUE_WORKERS=true pnpm --filter @bocardo/api dev` (always on in production). Apply DB migration `packages/database/src/migrations/0003_queue_and_integrity.sql` before deploying.

---

## 🚀 Quickstart & Development

### 1. Prerequisites
- Node.js >= 20.0.0
- pnpm >= 10.0.0

### 2. Installation
```bash
# Install dependencies across all apps and packages
pnpm install
```

### 3. Database Migration & Seeding
```bash
# Apply initial schema with PostGIS extensions
psql $DATABASE_URL -f packages/database/src/migrations/0001_initial_schema.sql

# Seed demo restaurants, dishes, pair associations, and riders
pnpm --filter @bocardo/database seed
```

### 4. Running the Platform
```bash
# Start all apps and API concurrently via Turborepo
pnpm run dev

# Or run individual applications:
pnpm --filter @bocardo/api dev       # Fastify + tRPC on http://localhost:3000
pnpm --filter @bocardo/admin dev     # Next.js Admin on http://localhost:3001
pnpm --filter @bocardo/customer start # Customer Expo App
pnpm --filter @bocardo/hotel start    # Hotel Partner Expo App
pnpm --filter @bocardo/rider start    # Rider Expo App
```

---

## 🛡️ Security & Idempotency Guarantees
1. **Integer-Paise Math:** All financial values are stored in integer paise (`BIGINT`) eliminating floating-point rounding errors.
2. **Broken Object-Level Authorization (BOLA/IDOR):** Strict multi-tenant verification in tRPC middleware.
3. **Webhook Idempotency:** Razorpay webhooks pass through `processed_webhooks` in a `SERIALIZABLE` transaction with row-level locks (`SELECT FOR UPDATE`).
4. **Distributed Cart Lock:** Redis `lock:cart:<userId>` prevents double-click race conditions during checkout.
