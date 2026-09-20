# 06 — Payments: Razorpay, Refunds, Idempotency

## Philosophy: Webhook-Authoritative

The client **never** tells the server "payment succeeded." Flow:

```
Customer app                API                       Razorpay
    │  order.create ────────►│                          │
    │                        │ orders.create ──────────►│
    │◄──── razorpayOrderId ──│◄────── order_xxx ────────│
    │  Razorpay Checkout SDK (UPI/card)                 │
    │────────────────────────────── payment ───────────►│
    │                        │◄── webhook payment.captured (HMAC signed)
    │                        │   → verify → PAID → outbox → kitchen bell
    │◄── socket order:status:update (PAID) ──│          │
```

## Hardening Checklist (all implemented)

- [x] **Signature verification** — `x-razorpay-signature` HMAC-SHA256 over the *raw* body, timing-safe compare, hex-format validated (`services/webhookSignature.ts`). Raw body preserved via custom content parser (`parseAs: 'string'`).
- [x] **Idempotency** — `x-razorpay-event-id` inserted into `processed_webhooks` in the same transaction as the order update; `ON CONFLICT DO NOTHING` → retries are no-ops.
- [x] **Row lock** — `SELECT ... FOR UPDATE` on the order inside the transaction.
- [x] **Amount/currency/status match** — captured amount must equal `total_amount_paise`, currency `INR`, status `captured`. Mismatch → error → Razorpay retries → manual reconciliation alert.
- [x] **payment.failed** — auto-cancels `PAYMENT_PENDING` orders with customer socket notification.
- [x] **Stale sweeper** — BullMQ repeat job every 10 min cancels `PAYMENT_PENDING` > 30 min (closed checkout without webhook).
- [x] **Refunds** — `paymentService.refundPayment` wraps `razorpay.payments.refund`, used by ghost-restaurant timeout, `order.cancelOrder`, and writes `refund_events` audit rows.
- [x] **Dev mocks gated** — mock keys + `ALLOW_MOCK_PAYMENTS=true` + `NODE_ENV=development` all required; impossible in production.

## Integer-Paise Contract

All amounts are integer paise end-to-end (DB `BIGINT`, zod `.int()`, Razorpay `amount` field). Display formatting via `formatPaiseToRupees` (`en-IN` locale). **Never** introduce floats for money.

## Webhook Setup (Razorpay Dashboard)

1. Dashboard → Settings → Webhooks → Add: `https://api.<domain>/webhooks/razorpay`
2. Events: `payment.captured`, `payment.failed` (optionally `refund.processed` for future reconciliation).
3. Copy the secret into `RAZORPAY_WEBHOOK_SECRET` on the VPS.
4. Test with Razorpay's "Send test webhook" — expect `200 {"status":"ok"}` and a row in `processed_webhooks`.

## Failure Playbook

| Symptom | Diagnosis | Fix |
|---|---|---|
| Order stuck PAYMENT_PENDING but customer charged | Webhook missed | Razorpay dashboard → webhook → retry; sweeper won't cancel (payment_id set only after capture) — verify `razorpay_order_id` then replay |
| 400 invalid signature | Secret mismatch | Rotate `RAZORPAY_WEBHOOK_SECRET` both sides |
| 503 reconciliation error | Amount mismatch / unknown order | Investigate `codex`-style logs, do NOT mark PAID manually until verified in Razorpay dashboard |
| Refund failed | Razorpay API error | Order is already cancelled; retry refund via dashboard, record UTR in `refund_events` manually |
