#!/usr/bin/env bash
# Zero-downtime-ish rolling deploy on the VPS.
# Usage: bash infra/scripts/deploy.sh [git-ref]
set -euo pipefail
REF="${1:-main}"
cd /opt/bocardo

echo "==> Pulling ${REF}"
git fetch origin && git checkout "${REF}" && git pull origin "${REF}"

echo '==> Build images'
docker compose -f docker-compose.prod.yml build --pull api admin

echo '==> Rolling update (replicas roll one at a time)'
docker compose -f docker-compose.prod.yml up -d --remove-orphans api admin caddy

echo '==> Prune old images'
docker image prune -f

echo '==> Health check'
sleep 8
curl -fsS http://127.0.0.1:3000/health && echo ' OK' || { echo 'API unhealthy — rolling back not automated, check logs'; exit 1; }
