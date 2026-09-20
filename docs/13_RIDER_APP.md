# 13 — Rider App Guide (`apps/rider`)

Expo Android, foreground GPS service. Package id `in.bocardo.rider`.

## Screens & Services

| Piece | File | Purpose |
|---|---|---|
| Duty home | `app/index.tsx` | Go Online/Offline, earnings glance, active order card |
| Offer modal | `components/DispatchOfferModal.tsx` | 30s countdown, ₹ payout, pickup/drop addresses, Accept/Decline |
| Delivery | `app/delivery/[id].tsx` | Navigation deep-link, masked customer phone, OTP entry → DELIVERED |
| GPS stream | `services/locationStream.ts` | Foreground service, 3s cadence, hardware GPS only (`isMocked` flagged) |

## Rules Enforced by Server (app is just a client)

- Only **online** riders with fresh GPS (≤60s) and no active order receive offers.
- One active order per rider (DB unique index).
- `DELIVERED` requires: 4-digit customer OTP + within 100m of drop + fresh accurate GPS + ≤5 attempts.
- Idle >2h with an order → server reaps and redispatches (rider freed automatically).

## Rider Etiquette Built Into UX

- Customer phone always masked (`+91 98*** **210`) — contact via masked relay (future) or in-app call intent.
- OTP is never shown to the rider in the app (server returns `****`); rider must ask the customer — this is the anti-fraud handshake.
