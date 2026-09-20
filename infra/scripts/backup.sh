#!/bin/sh
# Daily pg_dump with 14-day local retention. Sync offsite via rclone (see docs/18).
set -eu
TS=$(date +%Y%m%d_%H%M%S)
OUT="/backups/bocardo_${TS}.dump"
echo "[backup] starting ${OUT}"
pg_dump -Fc --no-owner --no-acl -f "${OUT}"
echo "[backup] wrote $(du -h "${OUT}" | cut -f1)"
# Retention: keep last 14 days
find /backups -name 'bocardo_*.dump' -mtime +14 -delete
echo "[backup] retention sweep complete"
