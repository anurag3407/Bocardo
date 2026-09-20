# 19 — Self-Hosted Supabase-Style PostgreSQL on the Same VPS

Bocardo uses **plain PostgreSQL 16 + PostGIS** (the same engine Supabase runs on), self-hosted in Docker. This doc covers operating it, and what changes if you want the full Supabase suite (Studio, Auth UI, REST/Realtime) or managed Supabase Cloud later.

## What You Get Today

| Supabase feature | Bocardo equivalent | Status |
|---|---|---|
| Postgres + PostGIS | `postgis/postgis:16-3.4` container | ✅ |
| Row Level Security | RLS enabled on all tables, PUBLIC revoked (migration 0002) | ✅ (app enforces authz; RLS as floor) |
| Realtime | Socket.io + Redis adapter + outbox (custom, lower latency than supabase-realtime for GPS) | ✅ |
| Auth | Clerk (replaces Supabase Auth; JWT-verified at API) | ✅ |
| Storage | — (use GCS bucket + signed URLs when image uploads ship) | 🔲 roadmap |
| Studio (DB UI) | optional container below | 🔲 optional |

## Adding Supabase Studio (DB admin UI) — Optional

Studio alone needs the Supabase meta services; the pragmatic self-hosted equivalent is **pgAdmin** or **CloudBeaver**:

```yaml
# add to docker-compose.prod.yml (internal only, behind caddy basic-auth or SSH tunnel)
  cloudbeaver:
    image: dbeaver/cloudbeaver:24
    restart: unless-stopped
    networks: [internal]
```

Safest access: **SSH tunnel** instead of exposing it:
```bash
gcloud compute ssh bocardo-prod --zone=asia-south1-a -- -L 5433:localhost:5432 -N
# then connect your desktop pgAdmin/DBeaver to localhost:5433
```
(Postgres port 5432 is not published by compose — bind it to 127.0.0.1 only if you tunnel regularly: `ports: ["127.0.0.1:5432:5432"]`.)

## Full Self-Hosted Supabase (not recommended for launch)

The complete Supabase compose stack (Kong, GoTrue, PostgREST, Realtime, Studio, Storage) adds ~1.5GB RAM and significant operational surface. Bocardo's API already provides everything those services would. **Skip it** — the value of "self-hosted Supabase" for this project is the database itself, which you have, tuned, with backups.

## Migrating to Supabase Cloud Later (if desired)

1. `pg_dump -Fc` from the VPS (see backup script).
2. Create Supabase project (Mumbai region) → restore via `pg_restore` into the `postgres` role.
3. Repoint `DATABASE_URL`/`DIRECT_URL` to the Supabase pooler (session mode for API, direct for migrations).
4. Keep RLS enabled — policies must be authored before exposing anon keys anywhere. Bocardo apps never use anon keys (all traffic goes through the API), so exposure is nil.

## Connection Strings

| Purpose | Value |
|---|---|
| API runtime | `postgresql://bocardo:$POSTGRES_PASSWORD@postgres:5432/bocardo` (docker network) |
| Migrations | same (or direct host via SSH tunnel) |
| Pooling | app pool built-in (`max: 20` per API replica → 40 total; `max_connections = 200` leaves headroom) |

> If you later add serverless/edge workers, put **PgBouncer** (transaction mode) in front — roadmap item, not needed at launch scale.
