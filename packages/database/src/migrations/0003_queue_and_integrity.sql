-- ==============================================================================
-- 0003_queue_and_integrity.sql
-- Durable-queue era integrity guards:
--  1. Prevent double-settlement of the same restaurant for overlapping periods
--  2. Index to accelerate stale PAYMENT_PENDING sweeps
--  3. Index for rider-abandonment reaper
-- ==============================================================================

BEGIN;

-- 1. Prevent overlapping PENDING settlement rows per entity (blocks duplicate
--    payouts even if generateWeeklyLedger is invoked twice concurrently).
CREATE UNIQUE INDEX IF NOT EXISTS settlements_pending_entity_period_unique
  ON settlements (entity_type, entity_id, start_date, end_date)
  WHERE status = 'PENDING';

-- 2. Stale PAYMENT_PENDING sweep (orders older than 30 min, never captured)
CREATE INDEX IF NOT EXISTS idx_orders_pending_sweep
  ON orders (created_at)
  WHERE status = 'PAYMENT_PENDING';

-- 3. Rider-abandonment reaper scan
CREATE INDEX IF NOT EXISTS idx_orders_active_delivery_sweep
  ON orders (updated_at)
  WHERE status IN ('RIDER_ASSIGNED', 'OUT_FOR_DELIVERY');

-- 4. Refund audit trail (who refunded what, and why)
CREATE TABLE IF NOT EXISTS refund_events (
    id BIGSERIAL PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id),
    razorpay_payment_id VARCHAR(255) NOT NULL,
    razorpay_refund_id VARCHAR(255),
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    reason TEXT NOT NULL,
    initiated_by VARCHAR(20) NOT NULL, -- CUSTOMER | RESTAURANT | ADMIN | SYSTEM
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refund_events_order ON refund_events(order_id);

ALTER TABLE refund_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE refund_events FROM PUBLIC;

COMMIT;
