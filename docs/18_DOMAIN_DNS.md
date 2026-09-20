# 18 — Domain, DNS & TLS Setup

## 1. DNS Records (at your registrar / Cloud DNS)

| Type | Host | Value | TTL |
|---|---|---|---|
| A | `@` | `<static IP from doc 16>` | 300 |
| A | `api` | `<same IP>` | 300 |
| A | `admin` | `<same IP>` | 300 |
| (optional) A | `www` | `<same IP>` | 300 |

Wait for propagation: `dig +short api.<domain>` should return the IP.

## 2. TLS via Caddy (automatic)

Caddy is already configured (`infra/caddy/Caddyfile`):

- `api.<domain>` → API (tRPC + webhooks + `/socket.io/*` websocket upgrades)
- `admin.<domain>` → Next.js admin
- `<domain>` → redirects to admin (swap for a marketing site later)

Caddy auto-issues & renews **Let's Encrypt** certificates the moment DNS resolves and ports 80/443 are reachable — no certbot, no cron. Certificates persist in the `caddy_data` volume.

```bash
# Set the domain before first up:
echo 'DOMAIN=bocardo.in' >> .env.production
docker compose -f docker-compose.prod.yml up -d caddy
docker compose -f docker-compose.prod.yml logs caddy   # watch cert issuance
```

## 3. Verify TLS & Headers

```bash
curl -sI https://api.bocardo.in/health | head -8
# expect: HTTP/2 200, strict-transport-security, x-content-type-options, no Server header
```

## 4. Mobile Deep Links / App Links

- Android intent filters use the `bocardo-customer://` scheme (see `app.json`). For universal links later, host `/.well-known/assetlinks.json` on the apex domain.

## 5. Cloudflare Alternative (optional)

If you prefer Cloudflare DNS+proxy: set SSL mode **Full (strict)**, disable proxying for `api` initially (websockets work on CF free, but debugging TLS is simpler direct), and keep Caddy for origin certs.
