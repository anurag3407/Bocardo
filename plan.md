# Master Engineering Plan: 4-App Food Ordering Platform Monorepo (Production-Hardened)

**Author:** Technical Architecture & Security Team  
**Date:** September 2026  
**Target Architecture:** Turborepo + pnpm Monorepo  
**Platforms:** React Native (Expo) for Customer, Hotel, and Rider | Next.js for Admin | Fastify + tRPC for Backend API  
**Database:** Supabase (PostgreSQL 16 + PostGIS)  
**Authentication:** Clerk Pro (Unified RBAC with Just-In-Time DB Sync)  
**Payments:** Razorpay (Webhook-Authoritative, Idempotent, Integer-Paise Math)  
**Real-Time:** Socket.io + Redis Pub/Sub  

---

## Table of Contents
1. [System Architecture & Monorepo Layout](#1-system-architecture--monorepo-layout)
2. [Hardened Database Schema & PostGIS Specifications](#2-hardened-database-schema--postgis-specifications)
3. [Security Architecture, Auth & BOLA/IDOR Defenses](#3-security-architecture-auth--bolaidor-defenses)
4. [Production Payment Engine, Idempotency & Concurrency](#4-production-payment-engine-idempotency--concurrency)
5. [Real-Time Socket Gateway & GPS Stream Throttling](#5-real-time-socket-gateway--gps-stream-throttling)
6. [Sequential 1-to-1 Rider Dispatch & Anti-Fraud Engine](#6-sequential-1-to-1-rider-dispatch--anti-fraud-engine)
7. [Kitchen Hardware, Audio Alarms & Printer Queue Resilience](#7-kitchen-hardware-audio-alarms--printer-queue-resilience)
8. [Phase 1 Recommendation Engine Architecture](#8-phase-1-recommendation-engine-architecture)
9. [Financial Settlements, Indian Tax (CGST 9(5)) & Admin Ops](#9-financial-settlements-indian-tax-cgst-95--admin-ops)
10. [Step-by-Step Implementation Roadmap](#10-step-by-step-implementation-roadmap)

---

## 1. System Architecture & Monorepo Layout

The platform is structured as a **Turborepo** monorepo using **pnpm workspaces**. Code is shared aggressively across all 4 applications through TypeScript packages.

```
joyful-brahmagupta/
├── apps/
│   ├── customer/            # Expo SDK 51+ (iOS, Android, PWA Web)
│   ├── hotel/               # Expo SDK 51+ (Android Tablet & Phone)
│   ├── rider/               # Expo SDK 51+ (Android Phone with Foreground GPS)
│   ├── admin/               # Next.js 14+ App Router (Desktop Ops Dashboard)
│   └── api/                 # Fastify + tRPC v11 + Socket.io + BullMQ
├── packages/
│   ├── api-client/          # tRPC generated client & TanStack React Query hooks
│   ├── database/            # Supabase migrations, Drizzle/Prisma schema, PostGIS helpers
│   ├── shared-types/        # Zod validation schemas, state machines, DTOs
│   ├── ui/                  # NativeWind v4 + React Native Reusables (shadcn components)
│   ├── eslint-config/       # Unified linting rules
│   └── typescript-config/   # Base tsconfig configurations
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

### High-Level Service Topology

```
 [Customer App]   [Hotel Partner App]   [Rider App]       [Admin Dashboard]
 (Expo Mobile)     (Expo Tablet/ESC)     (Expo GPS)         (Next.js Web)
       │                   │                  │                   │
       └───────────────────┴─────────┬────────┴───────────────────┘
                                     │ (tRPC over HTTPS / WSS)
                                     ▼
                    [ Fastify API Gateway (Port 3000) ]
                    ├── tRPC Router (BOLA/IDOR Verified Procedures)
                    ├── Socket.io Server (Redis Adapter)
                    ├── Webhook Receivers (Razorpay, Clerk)
                    └── BullMQ Workers (Timeouts, Refunds, Pairs)
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         ▼                           ▼                           ▼
[Supabase (PostgreSQL + PostGIS)] [Redis (Cache & PubSub)] [Cloudflare R2]
(Orders, Menus, Users, Geo)       (Locks, Queues, Grids)   (Photos, KOT, Backups)
```

---

## 2. Hardened Database Schema & PostGIS Specifications

All monetary figures are stored in **integer paise** (`BIGINT`, e.g., ₹250.50 = `25050`) to eradicate floating-point rounding bugs.

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users (Synced from Clerk + JIT fallback)
CREATE TYPE user_role AS ENUM ('CUSTOMER', 'RESTAURANT', 'RIDER', 'ADMIN');

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(20) UNIQUE,
    full_name VARCHAR(255),
    role user_role NOT NULL DEFAULT 'CUSTOMER',
    is_suspended BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_users_clerk ON users(clerk_id);

-- 2. Restaurants (Spatial entity)
CREATE TABLE restaurants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) NOT NULL,
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    address TEXT NOT NULL,
    gstin VARCHAR(15), -- Required for GST compliance
    commission_rate NUMERIC(4, 2) DEFAULT 15.00, -- 15.00%
    is_active BOOLEAN DEFAULT TRUE,
    is_accepting_orders BOOLEAN DEFAULT TRUE,
    rating NUMERIC(2, 1) DEFAULT 4.0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_restaurants_location ON restaurants USING GIST(location);

-- 3. Dishes & Menu
CREATE TABLE dishes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price_paise BIGINT NOT NULL CHECK (price_paise > 0), -- Stored in paise (₹100 = 10000)
    image_url TEXT,
    is_veg BOOLEAN DEFAULT TRUE,
    is_available BOOLEAN DEFAULT TRUE,
    meal_slots TEXT[] NOT NULL DEFAULT ARRAY['LUNCH', 'DINNER'],
    preparation_time_minutes INT DEFAULT 20,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_dishes_restaurant_available ON dishes(restaurant_id, is_available);
CREATE INDEX idx_dishes_meal_slots ON dishes USING GIN(meal_slots);

-- 4. Co-occurrence Matrix for Cart Recommendations
CREATE TABLE dish_pair_associations (
    dish_id_a UUID REFERENCES dishes(id) ON DELETE CASCADE,
    dish_id_b UUID REFERENCES dishes(id) ON DELETE CASCADE,
    co_occurrence_count INT DEFAULT 1,
    PRIMARY KEY (dish_id_a, dish_id_b)
);
CREATE INDEX idx_dish_pair_a ON dish_pair_associations(dish_id_a, co_occurrence_count DESC);

-- 5. Orders State Machine with Delivery OTP & Fraud Guards
CREATE TYPE order_status AS ENUM (
    'PAYMENT_PENDING',
    'PAID',
    'ACCEPTED_BY_KITCHEN',
    'PREPARING',
    'READY_FOR_PICKUP',
    'RIDER_ASSIGNED',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'CANCELLED_BY_CUSTOMER',
    'CANCELLED_BY_KITCHEN',
    'CANCELLED_BY_SYSTEM'
);

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id),
    rider_id UUID REFERENCES users(id),
    status order_status NOT NULL DEFAULT 'PAYMENT_PENDING',
    delivery_location GEOGRAPHY(POINT, 4326) NOT NULL,
    delivery_address TEXT NOT NULL,
    delivery_otp VARCHAR(4) NOT NULL, -- 4-digit code customer gives to rider
    
    -- Financials in integer paise
    subtotal_paise BIGINT NOT NULL,
    food_gst_paise BIGINT NOT NULL,       -- 5% GST collected on behalf of restaurant
    delivery_fee_paise BIGINT NOT NULL DEFAULT 0,
    platform_fee_paise BIGINT NOT NULL DEFAULT 500, -- ₹5.00 platform fee
    service_gst_paise BIGINT NOT NULL,    -- 18% GST on delivery + platform fee
    total_amount_paise BIGINT NOT NULL,
    
    razorpay_order_id VARCHAR(255) UNIQUE,
    razorpay_payment_id VARCHAR(255),
    cancel_reason TEXT,
    refund_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_orders_customer ON orders(customer_id, created_at DESC);
CREATE INDEX idx_orders_restaurant ON orders(restaurant_id, status);
CREATE INDEX idx_orders_rider ON orders(rider_id, status);

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    dish_id UUID NOT NULL REFERENCES dishes(id),
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price_paise BIGINT NOT NULL,
    total_price_paise BIGINT NOT NULL
);

-- 6. Payment Webhook Idempotency Table
CREATE TABLE processed_webhooks (
    event_id VARCHAR(255) PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    payload JSONB
);

-- 7. Settlement Ledger (Manual Offline Payouts)
CREATE TABLE settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL, -- 'RESTAURANT' or 'RIDER'
    entity_id UUID NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    gross_amount_paise BIGINT NOT NULL,
    commission_deducted_paise BIGINT NOT NULL,
    net_payout_paise BIGINT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'PAID'
    bank_utr_reference VARCHAR(100),
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 3. Security Architecture, Auth & BOLA/IDOR Defenses

### A. Just-In-Time (JIT) Clerk Synchronization
To resolve the race condition where a new user fires `order.create` before Clerk’s `user.created` webhook hits Fastify:
* In the tRPC authentication context:
  ```typescript
  export async function createContext({ req }: CreateFastifyContextOptions) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return { user: null };

    const decoded = await verifyClerkToken(token);
    
    // Atomic Just-in-Time Upsert: Guarantees user exists in PostgreSQL before procedure runs
    const user = await db.query(
      `INSERT INTO users (clerk_id, email, phone, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (clerk_id) DO UPDATE SET updated_at = NOW()
       RETURNING id, role, is_suspended`,
      [decoded.sub, decoded.email, decoded.phone, decoded.publicMetadata.role || 'CUSTOMER']
    );

    if (user.rows[0].is_suspended) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Account is suspended' });
    }

    return { user: user.rows[0] };
  }
  ```

### B. Broken Object-Level Authorization (BOLA/IDOR) Enforcement
Every procedure touching orders, menus, or tracking must verify multi-tenant ownership:
```typescript
export const getOrderProcedure = protectedProcedure
  .input(z.object({ orderId: z.string().uuid() }))
  .query(async ({ ctx, input }) => {
    const order = await getOrderById(input.orderId);
    if (!order) throw new TRPCError({ code: 'NOT_FOUND' });

    // Authorization Barrier
    if (ctx.user.role === 'CUSTOMER' && order.customerId !== ctx.user.id) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
    }
    if (ctx.user.role === 'RESTAURANT' && order.restaurantId !== ctx.user.restaurantId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
    }
    if (ctx.user.role === 'RIDER' && order.riderId !== ctx.user.id) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Access denied' });
    }

    // Never return raw customer phone to Rider or Hotel
    if (ctx.user.role === 'RIDER' || ctx.user.role === 'RESTAURANT') {
      order.customerPhone = maskPhoneNumber(order.customerPhone); // e.g. +91 98*** **210
    }

    return order;
  });
```

---

## 4. Production Payment Engine, Idempotency & Concurrency

### The Complete Idempotent Order & Payment Pipeline

```
1. Customer initiates checkout
       │
       ▼
2. Server validates cart against live DB prices (Rejects client-tampered totals)
3. Acquire Redis lock: `lock:cart:<userId>` (prevents concurrent duplicate clicks)
4. Insert Order into Supabase: `status = 'PAYMENT_PENDING'`
5. Create Razorpay Order with unique receipt: `receipt: order_<uuid>`
6. Set 15-minute BullMQ Payment Timeout Job
       │
       ▼
Customer pays via Razorpay Native SDK
       │
       ├─────────────────────────────────────────┐
       ▼ (Webhook Flow - Single Source of Truth)  ▼ (Client Polling Fallback)
Razorpay Webhook: `payment.captured`     Client sends `razorpay_signature`
       │                                         │
       ▼                                         ▼
Verify HMAC SHA-256 Signature             Verify HMAC SHA-256 Signature
       │                                         │
       └────────────────────┬────────────────────┘
                            │
                            ▼
          [PostgreSQL Serializable Transaction]
          ├── Check `processed_webhooks` for `event_id` (Exit if duplicate)
          ├── Acquire lock: `SELECT * FROM orders WHERE id = $1 FOR UPDATE`
          ├── Assert status is `PAYMENT_PENDING`
          ├── Update order status to `PAID`
          ├── Insert `event_id` into `processed_webhooks`
          └── Commit Transaction
                            │
                            ▼
    Emit Socket Event: `restaurant:<id>` (Incoming Order Bell)
    Schedule BullMQ Job: 120-second Ghost Restaurant Timer
```

### Ghost Restaurant Timeout (120-Second Auto-Refund)
If the restaurant is offline, dead-battery, or ignores the incoming order:
1. At $t = 120\text{ seconds}$, a BullMQ delayed worker fires.
2. Checks order status. If still `PAID` (not `ACCEPTED_BY_KITCHEN`):
   - Transitions order status to `CANCELLED_BY_SYSTEM`.
   - Invokes Razorpay Instant Refund API:
     ```typescript
     await razorpay.payments.refund(order.razorpayPaymentId, {
       amount: order.totalAmountPaise,
       notes: { reason: 'Restaurant non-responsive within 120 seconds' }
     });
     ```
   - Toggles restaurant `is_accepting_orders = FALSE` to prevent further customer disappointment.
   - Pushes FCM + Socket notification to customer: *"Restaurant is currently unavailable. Your payment has been refunded automatically."*

---

## 5. Real-Time Socket Gateway & GPS Stream Throttling

### The GPS Throttling & In-Memory Redis Architecture
To prevent 500 riders streaming GPS every 3 seconds from crashing PostgreSQL write IOPS:

```
[Rider App Foreground Service] (Pings every 3s)
              │
              ▼
[Fastify Socket.io Server]
              │
              ├── 1. Check `isMocked === true` (Reject if fake GPS detected)
              ├── 2. Write to Redis: `SET rider:loc:<id> '{"lat":..,"lng":..}' EX 30`
              └── 3. Broadcast to Socket room: `order_tracking:<orderId>`
```
* **PostgreSQL is never touched** for live continuous coordinate streaming.
* Coordinates are kept strictly in **Redis** and streamed in-memory to the customer app.
* PostgreSQL is only updated on major milestones: `PICKED_UP` and `DELIVERED`.

---

## 6. Sequential 1-to-1 Rider Dispatch & Anti-Fraud Engine

### 1-to-1 Sequential Assignment (Uber/Swiggy Style)
1. Order reaches `PREPARING` with 5 minutes remaining, or kitchen marks `READY_FOR_PICKUP`.
2. BullMQ query selects the single nearest online rider within 4 km via PostGIS:
   ```sql
   SELECT u.id, ST_Distance(r.location, ST_SetSRID(ST_MakePoint($lng, $lat), 4326)::geography) AS distance
   FROM users u
   JOIN rider_profiles rp ON u.id = rp.user_id
   WHERE u.role = 'RIDER' 
     AND rp.is_online = TRUE 
     AND rp.active_order_id IS NULL
     AND NOT (u.id = ANY($rejected_rider_ids))
     AND ST_DWithin(r.location, ST_SetSRID(ST_MakePoint($lng, $lat), 4326)::geography, 4000)
   ORDER BY distance ASC
   LIMIT 1;
   ```
3. Emit `dispatch:offer` to `rider:<riderId>` with a strict **30-second ticking countdown**.
4. If accepted $\rightarrow$ Lock order (`rider_id = riderId`), status $\rightarrow$ `RIDER_ASSIGNED`.
5. If rejected or 30-second timer expires $\rightarrow$ Append rider to `$rejected_rider_ids`, trigger next nearest rider.

### Delivery Handover OTP (Anti-Fraud Guard)
* When an order is created, the system generates a cryptographically random 4-digit code (`delivery_otp = "4819"`).
* Displayed prominently **only on the customer's mobile app screen**.
* When the rider arrives at the door, the Rider App requires this OTP.
* The rider cannot tap `DELIVERED` without the backend verifying the OTP, completely eliminating false delivery claims.

---

## 7. Kitchen Hardware, Audio Alarms & Printer Queue Resilience

### Bluetooth Thermal Printing (ESC/POS) Architecture
To prevent flaky Bluetooth connections or paper-out jams from freezing the restaurant tablet:

```
[Incoming Socket Order / Tap 'Accept']
                   │
                   ▼
  [Local SQLite In-App Print Queue]
                   │
                   ▼
      [Background Print Service]
                   │
         ┌─────────┴─────────┐
         ▼                   ▼
  [Printer Online]    [Printer Offline / Jammed]
         │                   │
  Prints 58mm/80mm    Shows Persistent Banner on Tablet:
  KOT Ticket          "Printer Disconnected - Tap to Reconnect"
                      + Manual "Reprint KOT" Button
```

### High-Volume Persistent Sound Alarm
* When an order arrives, starts an Android foreground audio loop on `STREAM_ALARM`.
* Bypasses the tablet's media volume / silent mode.
* Does not stop until kitchen staff physically presses **"Accept Order"**.

---

## 8. Phase 1 Recommendation Engine Architecture

Runs directly on your **PostgreSQL + PostGIS + Redis** stack with **zero external machine learning infrastructure costs**.

```
┌────────────────────────────────────────────────────────────────────────┐
│ 1. "Order It Again" (Personalized)                                     │
│    - Source: User's top delivered order items                          │
│    - Cache: Redis key `rec:user:<id>:again` (TTL: 1 hour)              │
├────────────────────────────────────────────────────────────────────────┤
│ 2. "Contextual Meal-Time Cravings" (Dynamic)                           │
│    - Slots: BREAKFAST (6-11am), LUNCH (11am-4pm),                      │
│             SNACKS (4-7pm), DINNER (7-11pm), LATE_NIGHT (11pm-6am)     │
│    - Filter: dishes.meal_slots matching current slot                   │
├────────────────────────────────────────────────────────────────────────┤
│ 3. "Trending Dishes Near You" (Hyperlocal)                             │
│    - Source: PostGIS ST_DWithin(5000m) + orders in last 7 days         │
│    - Cache: Redis key `rec:geo:<lat2>_<lng2>:<slot>` (TTL: 20 mins)    │
├────────────────────────────────────────────────────────────────────────┤
│ 4. "Frequently Bought Together" (Cart Upsell)                          │
│    - Source: dish_pair_associations co-occurrence count                │
│    - Trigger: Displayed on checkout screen matching current cart items │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Financial Settlements, Indian Tax (CGST 9(5)) & Admin Ops

### Section 9(5) CGST Dual-Tax Invoice Structure
Under Indian GST laws for food platforms (ECOs), every delivered order generates two distinct tax components:

1. **Restaurant Food Invoice (Issued on behalf of Restaurant):**
   * Food Subtotal: ₹400.00
   * 5% Food GST (Section 9(5)): ₹20.00
   * *Total Food Bill:* ₹420.00 *(Platform collects & remits to GST department)*
2. **Platform Services Invoice (Issued by your Platform):**
   * Delivery Fee: ₹40.00
   * Platform Service Fee: ₹5.00
   * 18% Service GST: ₹8.10
   * *Total Platform Bill:* ₹53.10

### Weekly Offline Settlement Workflow
1. **Sunday Midnight Cron:** Aggregates net balances per hotel:
   $$\text{Net Payout} = \text{Food Subtotal} - \text{Commission (15\%)} - \text{TCS/TDS} - \text{Refunds}$$
2. **Admin Dashboard:** Generates bank transfer CSV (Account Number, IFSC, Net Amount).
3. **Manual Transfer & UTR:** Admin transfers via corporate Net Banking, enters the bank **UTR Reference Number** into the dashboard to mark records `PAID`.

---

## 10. Step-by-Step Implementation Roadmap

```
Week 1: Hardened Monorepo & Database
├── Setup Turborepo + pnpm + NativeWind v4 design system
├── Provision Supabase PostGIS schemas with integer-paise & delivery OTP
└── Setup Fastify backend API with tRPC v11 & Redis connection

Week 2: Auth, BOLA Guards & Payments
├── Integrate Clerk Pro with Just-In-Time PostgreSQL user synchronization
├── Implement Razorpay order creation & webhook idempotency pipeline
├── Configure 120s Ghost Restaurant Auto-Refund worker in BullMQ
└── Setup Socket.io real-time server with Redis pub/sub adapter

Week 3: Customer App & Recommendation Engine
├── Implement Customer App UI (Home feed, search, cart, checkout)
├── Implement Phase 1 Recommendation Engine with spatial geogrid caching
└── Build Live tracking screen with animated rider marker

Week 4: Hotel App & Kitchen Hardware
├── Implement Hotel Partner App (Order reception, menu toggle)
├── Integrate looping high-volume alarm channel (Android foreground)
└── Integrate ESC/POS Bluetooth/USB thermal printer with local SQLite queue

Week 5: Rider App & Sequential Dispatch Engine
├── Implement Rider App UI (Online toggle, mock GPS rejection)
├── Implement State-Driven Foreground GPS tracking service (streaming to Redis)
├── Build 1-to-1 sequential dispatch algorithm with 30s countdown worker
└── Implement Delivery Handover OTP verification screen

Week 6: Admin Dashboard & End-to-End Verification
├── Build Admin Next.js portal (live order map, restaurant onboarding)
├── Implement Weekly Offline Settlement Ledger & UTR reconciliation
└── Perform end-to-end integration tests (Order -> Payment -> Kitchen -> Dispatch -> Delivery)
```
