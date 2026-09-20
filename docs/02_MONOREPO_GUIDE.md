# 02 — Monorepo Layout & Code Conventions

## Toolchain

- **pnpm 10.33 workspaces** — one lockfile, workspace protocol `workspace:*` for internal deps
- **Turborepo** — `pnpm build|dev|lint|typecheck` orchestrates across apps with caching
- **TypeScript 5.5** everywhere, strict mode via `packages/typescript-config`
- **Prettier 3** — `pnpm format`

## Package Contracts

| Package | Exports | Rule |
|---|---|---|
| `@bocardo/shared-types` | zod schemas, enums, state machine, tax math | **Zero runtime deps beyond zod.** This is the single source of truth shared by all 5 apps. If a shape is used by 2+ apps, it lives here. |
| `@bocardo/database` | `db` pool, `withTransaction`, PostGIS helpers | Only the API imports this. Mobile/web apps never touch the DB. |
| `@bocardo/api-client` | tRPC client + React Query hooks | All app→API calls go through here; no hand-rolled fetch. |
| `@bocardo/ui` | `theme`, `CurrencyDisplay`, `StatusPill`, `VegNonVegBadge` | Presentational only; no network, no state. |

## Naming & Style Conventions

- **Money:** `*Paise` suffix, integer, `BIGINT` in DB (`₹100.00 = 10000`).
- **DB columns:** `snake_case`; **TS fields:** `camelCase` (mapped in SELECT aliases).
- **IDs:** UUID v4 everywhere (`gen_random_uuid()`), never sequential.
- **tRPC routers:** one file per domain (`order.ts`, `rider.ts`…), procedures named `verbNoun` (`cancelOrder`, `toggleDishAvailability`).
- **Socket events:** `domain:action` (`order:status:update`, `dispatch:offer`, `restaurant:new_order`).
- **Errors:** throw `TRPCError` with a precise code (`PRECONDITION_FAILED`, `CONFLICT`…) — never leak raw DB errors to clients.
- **SQL:** parameterized queries only (`$1, $2`). Dynamic SQL is allowed only for whitelisted filter branches with params appended via `params.push`.

## Adding a Feature — the Golden Path

1. Define/extend the zod schema + enums in `packages/shared-types`.
2. Add migration SQL in `packages/database/src/migrations/` (next sequence number, idempotent `IF NOT EXISTS`).
3. Implement the tRPC procedure in `apps/api/src/routers/` with the correct `roleProtectedProcedure` guard.
4. Emit realtime changes via `socketService` or the transactional `realtime_outbox` table.
5. Consume via `@bocardo/api-client` hooks in the app.
6. Add a test in `tests/` and wire it into the root `pnpm test` script.

## Commands Cheat-Sheet

```bash
pnpm install                 # install all workspaces
pnpm dev                     # turbo: run api + admin (+ expo apps if configured)
pnpm test                    # all platform verification suites
pnpm --filter @bocardo/api typecheck
pnpm --filter @bocardo/api build
pnpm --filter @bocardo/database seed
```
