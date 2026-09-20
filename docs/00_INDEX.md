# Bocardo Documentation Index

> **Bocardo** — a Swiggy/Zomato-class, 4-app food delivery platform: customer app, restaurant (hotel) partner app, rider app, and admin ops console, backed by a Fastify + tRPC + Socket.io + BullMQ API on self-hosted PostgreSQL 16/PostGIS + Redis.

**Stack:** Turborepo + pnpm · Expo SDK 51 (iOS/Android) · Next.js 14 · Fastify 4 · tRPC v11 · Socket.io · BullMQ · PostgreSQL 16 + PostGIS · Redis 7 · Razorpay · Clerk · Caddy · Docker Compose on a single Google Cloud VPS.

**Brand:** Signature teal `#0D9488` (light `#F0FDFA`, dark `#0F766E`).

---

## Reading Order

### Part 1 — Product & Engineering
1. [01 — Project Overview & Architecture](01_PROJECT_OVERVIEW.md)
2. [02 — Monorepo Layout & Code Conventions](02_MONOREPO_GUIDE.md)
3. [03 — Database Schema & PostGIS Design](03_DATABASE_SCHEMA.md)
4. [04 — API Reference (tRPC Routers & Webhooks)](04_API_REFERENCE.md)
5. [05 — Authentication & RBAC Security Model](05_AUTH_SECURITY.md)
6. [06 — Payments: Razorpay, Refunds, Idempotency](06_PAYMENTS.md)
7. [07 — Realtime: Socket.io Rooms, GPS Streaming, Outbox](07_REALTIME.md)
8. [08 — Order Lifecycle & Rider Dispatch Engine](08_ORDER_LIFECYCLE.md)
9. [09 — BullMQ Durable Workers & Scheduled Jobs](09_WORKERS_QUEUE.md)
10. [10 — UI/UX Design System (Teal Theme)](10_UI_DESIGN_SYSTEM.md)
11. [11 — Customer App Guide](11_CUSTOMER_APP.md)
12. [12 — Hotel Partner App Guide](12_HOTEL_APP.md)
13. [13 — Rider App Guide](13_RIDER_APP.md)
14. [14 — Admin Dashboard Guide](14_ADMIN_APP.md)
15. [15 — Indian Tax Compliance (Sec 9(5)) & Settlements](15_TAX_SETTLEMENTS.md)

### Part 2 — Production Launch
16. [16 — VPS Provisioning on Google Cloud](16_VPS_PROVISIONING.md)
17. [17 — Docker Deployment Guide](17_DOCKER_DEPLOYMENT.md)
18. [18 — Domain, DNS & TLS Setup](18_DOMAIN_DNS.md)
19. [19 — Self-Hosted Supabase-Style PostgreSQL Operations](19_SUPABASE_DB.md)
20. [20 — Database Optimization & Maintenance](20_DB_OPTIMIZATION.md)
21. [21 — Building APKs & App Store Release (EAS)](21_BUILD_APK.md)
22. [22 — Monitoring, Logging & Alerting](22_MONITORING.md)
23. [23 — Backups, Disaster Recovery & Rollback](23_BACKUP_DR.md)
24. [24 — Production Launch Checklist](24_PRODUCTION_CHECKLIST.md)
25. [25 — Troubleshooting Runbook](25_TROUBLESHOOTING.md)
26. [26 — Security Audit (200-Vector Assessment)](26_SECURITY_AUDIT.md)

### Reference
- [Swiggy/Zomato Flow Teardown (industry analysis)](swiggy_zomato_flow_analysis.md)
- Repo root: `plan.md` (original architecture plan), `README.md` (quickstart)
