-- ==============================================================================
-- 0004_settlement_audit_and_tax.sql
-- Real-world statutory compliance & audit integrity:
--  1. Link orders to settlements (prevents double-billing and missed late orders)
--  2. 18% GST on platform commission + 1% TDS (Sec 194-O) + 1% TCS (Sec 52)
--  3. Society gate handover and emergency delivery override audit flags
--  4. Restaurant FSSAI license compliance
-- ==============================================================================

BEGIN;

-- 1. Add statutory tax & deduction columns to settlements ledger
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS commission_gst_paise BIGINT NOT NULL DEFAULT 0 CHECK (commission_gst_paise >= 0);
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS tds_deducted_paise BIGINT NOT NULL DEFAULT 0 CHECK (tds_deducted_paise >= 0);
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS tcs_deducted_paise BIGINT NOT NULL DEFAULT 0 CHECK (tcs_deducted_paise >= 0);
ALTER TABLE settlements ADD COLUMN IF NOT EXISTS packaging_fee_paise BIGINT NOT NULL DEFAULT 0 CHECK (packaging_fee_paise >= 0);

-- 2. Link orders directly to settlements
ALTER TABLE orders ADD COLUMN IF NOT EXISTS settlement_id UUID REFERENCES settlements(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_orders_settlement_id ON orders(settlement_id) WHERE settlement_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_unsettled ON orders(status, created_at) WHERE settlement_id IS NULL;

-- 3. Doorstep delivery emergency overrides (battery dead, customer unreachable, society gate)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS emergency_otp_override BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS emergency_override_reason TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at_gate BOOLEAN NOT NULL DEFAULT FALSE;

-- 4. Restaurant FSSAI 14-digit license number
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS fssai_license_number VARCHAR(14);

COMMIT;
