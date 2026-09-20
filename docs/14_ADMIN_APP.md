# 14 — Admin Dashboard Guide (`apps/admin`)

Next.js 14 App Router, Tailwind (teal `bocardo` palette), tRPC + React Query. Served at `https://admin.<domain>`.

## Pages

| Route | Purpose |
|---|---|
| `/` | Live city ops map — active riders, in-flight orders, restaurant status (socket-fed) |
| `/orders` | Order stream with status pills; manual admin cancel (refund) for support cases |
| `/restaurants` | Onboarding: GSTIN check, commission rate (default 15%), go-live toggle |
| `/settlements` | Weekly ledger: generate, export bank CSV, UTR reconcile |
| `/taxes` | Sec 9(5) dual-tax reconciliation: food GST (5%) vs platform service GST (18%) |

## Access Control

Only `ADMIN` role JWTs (see doc 05 — grant via `PRIVILEGED_ROLES` or DB). The Next.js app should also be fronted by Clerk middleware; the API independently enforces role on every procedure (never rely on UI hiding).

## Ops Workflows

**Restaurant go-live:** verify GSTIN format (15 chars) → set commission → toggle `is_active`. Commission changes apply to *future* settlements only (ledger rows are immutable).

**Weekly payout run (every Monday 10:00 IST):**
1. `/settlements` → Generate Weekly Ledger (idempotent — DB blocks duplicate PENDING rows for the same period).
2. Export Bank CSV → upload to corporate net banking (HDFC/ICICI bulk transfer).
3. After bank confirmation → Reconcile with UTR per row → status `PAID`.

**Support cancellation:** `/orders` → order detail → Cancel (admin) → automatic full refund + audit row. Check `/taxes` impact in the same breath.
