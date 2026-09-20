# 17 — Docker Deployment Guide

Everything runs from `docker-compose.prod.yml` at the repo root. Services: `caddy` (TLS edge), `api` (2 replicas), `admin` (Next.js), `postgres` (PostGIS), `redis` (AOF persistent), `pg-backup` (nightly dumps).

## First Deploy

```bash
cd /opt/bocardo
# .env.production must exist and be complete (see .env.production.example)
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api   # watch boot
```

On first boot Postgres auto-applies `packages/database/src/migrations/*.sql` (alphabetical) via `/docker-entrypoint-initdb.d`. **Subsequent schema changes must be applied manually:**

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U bocardo -d bocardo < packages/database/src/migrations/0003_queue_and_integrity.sql
```

## Verify

```bash
curl -s https://api.$DOMAIN/health          # {"status":"healthy"...}
curl -s https://admin.$DOMAIN | head -3     # Next.js HTML
docker compose -f docker-compose.prod.yml exec redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning ping
```

## Update Deploys (rolling)

```bash
bash infra/scripts/deploy.sh main
```
Pulls the ref, rebuilds `api`/`admin`, rolls containers (compose replaces replicas sequentially), health-checks, prunes images. Downtime ≈ seconds (Caddy retries the upstream during the gap).

## Image Build Notes

- API Dockerfile: pnpm workspace-aware multi-stage (deps → build → slim runtime, non-root user, wget healthcheck).
- Admin Dockerfile: requires Next **standalone output** — ensure `apps/admin/next.config.js` has `output: 'standalone'`.
- Builds happen on the VPS (no registry needed). If builds OOM on a small box, build locally and `docker save | ssh ... docker load`, or add GCP Artifact Registry.

## Resource Budgets (compose-enforced)

| Service | Limit |
|---|---|
| api (each replica) | 1 CPU / 768MB |
| postgres | 1536MB |
| redis | maxmemory 512mb (allkeys-lru for cache keys; BullMQ keys are durable via AOF) |

## Common Commands

```bash
docker compose -f docker-compose.prod.yml restart api          # bounce API
docker compose -f docker-compose.prod.yml logs --tail=200 api  # recent logs
docker compose -f docker-compose.prod.yml exec postgres psql -U bocardo  # DB shell
docker system df                                               # disk usage
docker compose -f docker-compose.prod.yml down                 # full stop (data persists in volumes)
```
