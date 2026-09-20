# 01 — Project Overview & Architecture

## What is Bocardo?

Bocardo is a full-stack, production-hardened food delivery platform targeting feature parity with Swiggy/Zomato for a single-city launch (Bengaluru), architected to scale horizontally afterwards.

**Four user-facing apps + one API:**

| App | Tech | Users | Purpose |
|---|---|---|---|
| `apps/customer` | Expo SDK 51 (iOS/Android/PWA) | Customers | Browse, order, pay, live-track |
| `apps/hotel` | Expo (Android tablet/phone) | Restaurant staff | KOT board, alarms, thermal printing, 86-ing |
| `apps/rider` | Expo (Android) | Delivery partners | Duty toggle, dispatch offers, GPS streaming, OTP handover |
| `apps/admin` | Next.js 14 App Router | Ops team | Live map, settlements, tax reconciliation, onboarding |
| `apps/api` | Fastify 4 + tRPC v11 + Socket.io + BullMQ | — | Single API gateway & realtime hub |

## System Context

```
┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐
│ Customer  │ │  Hotel    │ │  Rider    │ │  Admin    │
│  (Expo)   │ │  (Expo)   │ │  (Expo)   │ │ (Next.js) │
└─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
      │  tRPC/HTTPS + Socket.io (WSS)           │
      └─────────────┴───────┬─────┴─────────────┘
                            ▼
                  ┌───────────────────┐
                  │   Caddy (TLS)     │  :443, Let's Encrypt
                  └─────────┬─────────┘
                            ▼
              ┌─────────────────────────┐
              │  API (Fastify)  ×2      │  tRPC /trpc/*
              │  - routers              │  Socket.io /socket.io/*
              │  - BullMQ workers       │  Razorpay /webhooks/*
              └───────┬─────────┬───────┘
              ┌───────▼───┐ ┌───▼──────────┐
              │ PostgreSQL│ │ Redis 7      │
              │ 16+PostGIS│ │ cache/queue/ │
              │ (system   │ │ pubsub/GPS   │
              │  of record)│ │ hot state   │
              └───────────┘ └──────────────┘
                            ▲
              Razorpay webhooks (payment.captured / payment.failed)
```

## Design Tenets

1. **Webhook-authoritative money.** The DB only marks an order PAID after a signature-verified Razorpay webhook. Clients never assert payment state.
2. **Integer paise everywhere.** No floats for money. `CHECK` constraints enforce `total = subtotal + taxes + fees`.
3. **PostGIS is the geo engine.** Restaurant discovery, rider dispatch radius, and delivery geofence are `ST_DWithin` queries — no external geo service.
4. **Hot state in Redis, truth in Postgres.** GPS coordinates live in Redis (30s TTL); only 30s snapshots touch Postgres. Dispatch state is Redis-persisted; scheduling is BullMQ (crash-safe).
5. **BOLA/IDOR defense-in-depth.** Every query is role-scoped; socket room joins are server-verified; phone numbers are masked per role.
6. **Anti-fraud by default.** Mock-GPS rejection, delivery handover OTP (5-attempt cap + 100m geofence), ghost-restaurant 120s auto-refund, rider-abandonment reaper.
7. **Indian compliance first-class.** CGST Section 9(5) dual-tax: 5% food GST vs 18% platform service GST, reconciled in the admin tax view.

## Repository Layout

```
Bocardo/
├── apps/{customer,hotel,rider,admin,api}
├── packages/{shared-types,database,api-client,ui,eslint-config,typescript-config}
├── infra/{caddy,postgres,scripts}     # VPS deployment assets
├── docs/                              # this handbook (00–25)
├── tests/                             # platform verification suites
├── docker-compose.prod.yml
└── turbo.json, pnpm-workspace.yaml
```

## Scaling Path (single VPS → multi-node)

| Stage | Infra | Trigger |
|---|---|---|
| **Now** | 1 VPS (4 vCPU/8GB): Caddy, 2× API, admin, Postgres, Redis | 0–2k orders/day |
| Stage 2 | Managed Postgres (or dedicated DB VM), VPS runs stateless apps only | >40% DB CPU sustained |
| Stage 3 | API on Cloud Run/GKE behind Cloud Load Balancer; Redis → Memorystore | >10k orders/day |

Because the API is already stateless (JWT auth, Redis-backed dispatch, BullMQ queues, socket Redis adapter), horizontal scaling requires **zero code changes** — only infrastructure moves.
