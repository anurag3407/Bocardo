# 23 — Backups, Disaster Recovery & Rollback

## Backup Layers

| Layer | What | Schedule | Retention |
|---|---|---|---|
| `pg-backup` container | `pg_dump -Fc` of full DB | daily (24h loop) | 14 days in `pg_backups` volume |
| GCP disk snapshot | whole boot disk | daily via snapshot schedule | 7 days |
| Offsite (you must set up) | rclone sync of `/backups` to GCS bucket | daily | 30 days, bucket versioning on |
| Redis | AOF (`appendonly yes`) | continuous | restart recovery ≤1s loss |

### Offsite sync setup (10 minutes, do not skip)

```bash
# on the VPS
sudo apt-get install -y rclone
rclone config          # create 'gcs' remote (GCS service account JSON)
# cron: 30 2 * * * rclone sync /var/lib/docker/volumes/bocardo_pg_backups/_data gcs:bocardo-backups/db
```

## Restore Drill (practice this quarterly)

```bash
# 1. Stop writers
docker compose -f docker-compose.prod.yml stop api

# 2. Restore into a fresh DB
docker compose -f docker-compose.prod.yml exec postgres bash -c \
  'dropdb -U bocardo bocardo_restore; createdb -U bocardo bocardo_restore'
docker compose -f docker-compose.prod.yml cp /path/bocardo_YYYYMMDD.dump postgres:/tmp/
docker compose -f docker-compose.prod.yml exec postgres bash -c \
  'pg_restore -U bocardo -d bocardo_restore --no-owner /tmp/bocardo_YYYYMMDD.dump'

# 3. Validate row counts, then swap or export specific tables
```

Point-in-time recovery (WAL archiving) is a stage-2 upgrade — daily dumps + snapshots give ≤24h RPO today, acceptable for launch.

## Rollback Procedures

| What broke | Rollback |
|---|---|
| Bad API deploy | `git checkout <last-good-tag> && bash infra/scripts/deploy.sh <tag>` |
| Bad migration | restore from latest dump to `bocardo_restore`, diff, replay fix-forward (prefer fix-forward migrations over restores) |
| Bad mobile release | Play Console → halt rollout; ship fix via EAS Update if JS-only |
| VPS total loss | new VM → provision script → clone repo → `.env.production` from your password manager → restore latest offsite dump → DNS already points at static IP (reassign address) — target RTO 2h |

## What Is NOT Backed Up by Design

- Redis cache/GPS keys (ephemeral by definition; BullMQ queues persist via AOF and rebuild).
- `realtime_outbox` rows older than their 1s processing loop.
