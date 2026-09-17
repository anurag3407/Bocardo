-- ==============================================================================
-- 0001_initial_schema.sql
-- Production-Hardened Food Delivery Schema with PostGIS, Integer Paise & Sec 9(5)
-- ==============================================================================

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Enums
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('CUSTOMER', 'RESTAURANT', 'RIDER', 'ADMIN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE order_status AS ENUM (
        'PAYMENT_PENDING',
        'PAID',
        'ACCEPTED_BY_KITCHEN',
        'PREPARING',
        'READY_FOR_PICKUP',
        'RIDER_ASSIGNED',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'CANCELLED_BY_CUSTOMER',
        'CANCELLED_BY_KITCHEN',
        'CANCELLED_BY_SYSTEM'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. Users Table (Clerk JIT + Supabase Sync)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(20) UNIQUE,
    full_name VARCHAR(255),
    role user_role NOT NULL DEFAULT 'CUSTOMER',
    is_suspended BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_clerk ON users(clerk_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 4. Restaurants (Spatial Entity)
CREATE TABLE IF NOT EXISTS restaurants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) NOT NULL,
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    address TEXT NOT NULL,
    gstin VARCHAR(15), -- Required for GST compliance
    commission_rate NUMERIC(4, 2) DEFAULT 15.00, -- 15.00%
    is_active BOOLEAN DEFAULT TRUE,
    is_accepting_orders BOOLEAN DEFAULT TRUE,
    rating NUMERIC(2, 1) DEFAULT 4.2,
    cuisine TEXT[] DEFAULT ARRAY['North Indian', 'Biryani'],
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_restaurants_location ON restaurants USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_restaurants_status ON restaurants(is_active, is_accepting_orders);

-- 5. Dishes & Menu
CREATE TABLE IF NOT EXISTS dishes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price_paise BIGINT NOT NULL CHECK (price_paise > 0), -- Stored in paise (₹100 = 10000)
    image_url TEXT,
    is_veg BOOLEAN DEFAULT TRUE,
    is_available BOOLEAN DEFAULT TRUE,
    meal_slots TEXT[] NOT NULL DEFAULT ARRAY['LUNCH', 'DINNER'],
    preparation_time_minutes INT DEFAULT 20,
    category VARCHAR(100) DEFAULT 'Main Course',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dishes_restaurant_available ON dishes(restaurant_id, is_available);
CREATE INDEX IF NOT EXISTS idx_dishes_meal_slots ON dishes USING GIN(meal_slots);

-- 6. Dish Pair Associations (Cart Recommendation Co-Occurrence Matrix)
CREATE TABLE IF NOT EXISTS dish_pair_associations (
    dish_id_a UUID REFERENCES dishes(id) ON DELETE CASCADE,
    dish_id_b UUID REFERENCES dishes(id) ON DELETE CASCADE,
    co_occurrence_count INT DEFAULT 1,
    PRIMARY KEY (dish_id_a, dish_id_b)
);
CREATE INDEX IF NOT EXISTS idx_dish_pair_a ON dish_pair_associations(dish_id_a, co_occurrence_count DESC);

-- 7. Orders State Machine with Delivery OTP & Fraud Guards
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id),
    rider_id UUID REFERENCES users(id),
    status order_status NOT NULL DEFAULT 'PAYMENT_PENDING',
    delivery_location GEOGRAPHY(POINT, 4326) NOT NULL,
    delivery_address TEXT NOT NULL,
    delivery_otp VARCHAR(4) NOT NULL, -- 4-digit code customer gives to rider
    
    -- Financials in integer paise (Section 9(5) CGST)
    subtotal_paise BIGINT NOT NULL,
    food_gst_paise BIGINT NOT NULL,       -- 5% GST collected on behalf of restaurant
    delivery_fee_paise BIGINT NOT NULL DEFAULT 4000, -- ₹40.00
    platform_fee_paise BIGINT NOT NULL DEFAULT 500,  -- ₹5.00 platform fee
    service_gst_paise BIGINT NOT NULL,    -- 18% GST on (delivery + platform fee)
    total_amount_paise BIGINT NOT NULL,
    
    razorpay_order_id VARCHAR(255) UNIQUE,
    razorpay_payment_id VARCHAR(255),
    cancel_reason TEXT,
    refund_id VARCHAR(255),
    special_instructions TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_rider ON orders(rider_id, status);

-- 8. Order Items
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    dish_id UUID NOT NULL REFERENCES dishes(id),
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price_paise BIGINT NOT NULL,
    total_price_paise BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- 9. Payment Webhook Idempotency Table
CREATE TABLE IF NOT EXISTS processed_webhooks (
    event_id VARCHAR(255) PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    payload JSONB
);

-- 10. Rider Profiles (Duty & Real-Time Dispatch Tracking)
CREATE TABLE IF NOT EXISTS rider_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    is_online BOOLEAN DEFAULT FALSE,
    active_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    vehicle_type VARCHAR(50) DEFAULT 'MOTORCYCLE',
    last_location GEOGRAPHY(POINT, 4326),
    rating NUMERIC(2, 1) DEFAULT 4.8,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rider_profiles_online ON rider_profiles(is_online, active_order_id);

-- 11. Settlement Ledger (Manual Offline Bank Payouts & Section 9(5) Reports)
CREATE TABLE IF NOT EXISTS settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL, -- 'RESTAURANT' or 'RIDER'
    entity_id UUID NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    gross_amount_paise BIGINT NOT NULL,
    commission_deducted_paise BIGINT NOT NULL,
    net_payout_paise BIGINT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'PAID'
    bank_utr_reference VARCHAR(100),
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_settlements_status ON settlements(status, entity_type);
