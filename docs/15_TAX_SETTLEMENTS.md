# 15 — Indian Tax Compliance (Sec 9(5)) & Settlements

## CGST Section 9(5) — Dual Tax Model

For restaurant food delivery via an e-commerce operator, the **platform** is liable for GST on restaurant services. Bocardo splits every order into two tax lanes, computed in integer paise (`packages/shared-types/src/tax.ts`):

| Component | Rate | Lane |
|---|---|---|
| Food subtotal | 5% (`food_gst_paise`) | Restaurant food GST — reported under 9(5) |
| Delivery fee (₹40) + Platform fee (₹5) | 18% (`service_gst_paise`) | Platform service GST |
| Packaging fee | restaurant-borne | pass-through, no platform GST |
| Rider tip | 0% (pass-through) | 100% to rider |

`total = subtotal + foodGst + deliveryFee + platformFee + serviceGst + packagingFee + tip` — enforced by a DB CHECK constraint, so a code bug cannot persist an inconsistent order.

**Example (₹400 food):** food GST ₹20, delivery ₹40 + platform ₹5 → service GST ₹8.10 → **total ₹473.10** (covered by automated tests).

## Settlement Math

```
Net Restaurant Payout = Σ subtotal(delivered) − commission(15% default, per-restaurant) − refunds
```

- Aggregation window: rolling 7 days (`generateWeeklyLedger`).
- **Integrity guards:** unique partial index blocks duplicate PENDING rows per entity+period; only `DELIVERED` orders count (cancelled/refunded excluded automatically).
- Payout execution is **offline** (bank CSV → UTR reconcile) — matches how early-stage Indian platforms run settlements before integrating a payouts API. Roadmap: Razorpay Route/X for automated splits.

## Filing Support

- `/taxes` admin page: period-wise split of the two GST lanes → hand to your CA for GSTR-1/GSTR-3B.
- `refund_events` provides the credit-note audit trail for refunded orders.
- Keep GSTIN on every restaurant record; display it on invoices (invoice PDF generation is on the doc-24 backlog).

> ⚠️ This doc is engineering guidance, not tax advice. Confirm rates/thresholds with your CA for the current financial year.
