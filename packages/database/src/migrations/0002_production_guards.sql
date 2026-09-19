BEGIN;

ALTER TABLE orders ADD COLUMN otp_attempts INTEGER NOT NULL DEFAULT 0 CHECK (otp_attempts BETWEEN 0 AND 5);
ALTER TABLE orders ADD COLUMN delivered_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN prep_time_minutes INTEGER NOT NULL DEFAULT 20 CHECK (prep_time_minutes BETWEEN 1 AND 180);
ALTER TABLE orders ADD COLUMN packaging_fee_paise BIGINT NOT NULL DEFAULT 0 CHECK (packaging_fee_paise >= 0);
ALTER TABLE restaurants ADD COLUMN packaging_fee_paise BIGINT NOT NULL DEFAULT 0 CHECK (packaging_fee_paise >= 0);
ALTER TABLE orders ADD CONSTRAINT order_money_nonnegative CHECK (
  subtotal_paise >= 0 AND food_gst_paise >= 0 AND delivery_fee_paise >= 0 AND platform_fee_paise >= 0 AND service_gst_paise >= 0
);
ALTER TABLE orders ADD CONSTRAINT order_total_matches CHECK (
  total_amount_paise = subtotal_paise + food_gst_paise + delivery_fee_paise + platform_fee_paise + service_gst_paise + packaging_fee_paise
);
ALTER TABLE orders ADD CONSTRAINT delivery_otp_digits CHECK (delivery_otp ~ '^[0-9]{4}$');
ALTER TABLE order_items ADD CONSTRAINT item_money_matches CHECK (unit_price_paise > 0 AND total_price_paise = unit_price_paise * quantity);
CREATE UNIQUE INDEX orders_payment_unique ON orders(razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL;
CREATE UNIQUE INDEX riders_active_order_unique ON rider_profiles(active_order_id) WHERE active_order_id IS NOT NULL;

CREATE TABLE realtime_outbox (
  id BIGSERIAL PRIMARY KEY,
  room TEXT NOT NULL,
  event TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['users','restaurants','dishes','dish_pair_associations','orders','order_items','processed_webhooks','rider_profiles','settlements','realtime_outbox'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC', table_name);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM anon', table_name);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM authenticated', table_name);
    END IF;
  END LOOP;
END $$;

COMMIT;
