# 24 — Production Launch Checklist

## Infrastructure
- [ ] GCP VM e2-standard-4 in `asia-south1` with PD-SSD 80GB + static IP (doc 16)
- [ ] VPC firewall: 80/443 only; UFW on; SSH password auth off; fail2ban active
- [ ] DNS: `@`, `api`, `admin` A records → static IP; verified with `dig`
- [ ] `.env.production` complete: real Clerk live keys, Razorpay **live** keys, strong `POSTGRES_PASSWORD`/`REDIS_PASSWORD`, `PRIVILEGED_ROLES`, `ALLOWED_ORIGINS`
- [ ] `docker compose -f docker-compose.prod.yml up -d` → all healthy; certs issued (doc 18)
- [ ] Migrations 0001–0003 applied; seed data loaded; `pg_stat_statements` extension created
- [ ] Offsite backup cron (rclone → GCS) verified with a test restore (doc 23)
- [ ] Uptime Kuma or GCP uptime checks on `/health` + alerting to your phone

## Security
- [ ] `ALLOW_MOCK_AUTH` and `ALLOW_MOCK_PAYMENTS` are **unset/absent** in production env
- [ ] Rate limiting returns 429 under a load test: `for i in {1..350}; do curl -s https://api.<domain>/health; done | grep -c 429`
- [ ] Webhook signature rejects tampering (test suite green: `pnpm test`)
- [ ] Razorpay dashboard webhook URL → `https://api.<domain>/webhooks/razorpay` with `payment.captured` + `payment.failed`; secret matches env
- [ ] Clerk live instance JWT key/issuer/audience set; test token from a real signed-in user returns `auth.me`
- [ ] No `SUPABASE`/DB port published to the internet: `ss -tlnp | grep -E '5432|6379'` shows nothing public

## Money & Compliance
- [ ] End-to-end ₹1 live order: create → Razorpay live checkout → webhook → PAID → kitchen bell rings
- [ ] Cancel that order → refund visible in Razorpay dashboard + `refund_events` row
- [ ] Weekly ledger generates; CSV exports; UTR reconcile marks PAID
- [ ] `/taxes` view reconciles against a day's orders (5% + 18% lanes)

## Apps
- [ ] Customer/rider/hotel preview APKs built with prod env, installed on real devices
- [ ] Full order drill on devices: order → KOT alarm <5s → accept → print → ready → rider offer <10s → GPS track live on customer phone → OTP delivery close
- [ ] Play Console listing complete (privacy policy, data safety, screenshots with teal branding)
- [ ] EAS credentials backed up

## Operations
- [ ] On-call rota + escalation path documented for your team
- [ ] Runbook (doc 25) printed/bookmarked by ops
- [ ] Log rotation configured; disk alert at 75%

## Post-Launch Backlog (prioritized)
1. Push notifications (Expo Push/FCM) — sockets only reach foregrounded apps
2. Customer addresses book + live ETA from rider GPS
3. Sentry + Prometheus/Grafana overlay
4. Ratings & reviews; coupons engine
5. Invoice PDFs with GSTIN; Razorpay Route automated payouts
6. bull-board queue dashboard behind admin auth
7. Managed Postgres migration trigger review (doc 20 thresholds)
