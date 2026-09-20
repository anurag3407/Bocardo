# 11 — Customer App Guide (`apps/customer`)

Expo SDK 51, expo-router, React Query via `@bocardo/api-client`, socket.io-client for live tracking. Package id `in.bocardo.customer`.

## Screens

| Route | File | Features |
|---|---|---|
| `/` | `app/index.tsx` | Location header, search bar, meal-slot pills, trending near you, restaurant list (PostGIS 7km), floating teal cart bar |
| `/restaurant/[id]` | `app/restaurant/[id].tsx` | Menu grouped by category, veg/non-veg badges, add-to-cart stepper, "Frequently Bought Together" upsell tray |
| `/cart` | `app/cart.tsx` | Bill breakdown (subtotal, food GST 5%, delivery ₹40, platform ₹5, service GST 18%), tip chips ₹20/30/50, special instructions, Razorpay checkout launch |
| `/orders/[id]` | `app/orders/[id].tsx` | Live status stepper (`CUSTOMER_TRACKING_STEPS`), pulsing rider marker via socket, **delivery OTP card** (show at door), cancel button while kitchen hasn't accepted |

## Key Behaviors

- **Cart** is local (`lib/cart.ts` store) — server re-validates all prices at `order.create`, so stale local prices can never charge wrong amounts.
- **Payment**: opens Razorpay Checkout with `razorpayOrderId` from `order.create`; UI then listens to socket `order:status:update` for the PAID transition (webhook-driven — never trusts the SDK callback alone).
- **Cancellation UX**: enabled only at PAID; after that shows "kitchen is preparing" explainer. Refund message sets expectation (5–7 business days per Razorpay rails).
- **Offline/demo**: home screen renders demo restaurant cards if the API is unreachable (dev convenience; remove for store builds if undesired).

## Environment

`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SOCKET_URL`, `EXPO_PUBLIC_RAZORPAY_KEY_ID` — injected per EAS profile (see doc 21).
