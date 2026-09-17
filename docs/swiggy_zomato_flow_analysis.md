# Comprehensive User Flow & Architectural Analysis: Swiggy vs. Zomato vs. Bocardo Platform

## Executive Summary
This document provides a production-grade teardown and architectural comparison of **Swiggy** and **Zomato** user flows, state machines, hardware integrations, and algorithmic dispatch patterns, mapping them directly into the **Bocardo 4-App Food Delivery Monorepo**.

---

## 1. Customer Flow Analysis: Swiggy & Zomato vs. Bocardo

```
[Customer Journey Flowchart]

  Launch App
      │
      ▼
  [Hyperlocal Geofencing] ──► (PostGIS 5km radius / H3 hex cells)
      │
      ▼
  [Contextual Home Feed]
      ├── 1. Meal-Time Slot Carousel (Breakfast: 6-11am | Lunch: 11am-4pm | Snacks: 4-7pm | Dinner: 7-11pm | Late Night: 11pm-6am)
      ├── 2. "Order It Again" (Personalized top delivered items, Redis cached)
      └── 3. "Trending Near You" (Hyperlocal spatial sales velocity)
      │
      ▼
  [Restaurant Menu & Dish Selection]
      ├── Veg / Non-Veg Indicator Badges (Green dot vs. Brown triangle)
      ├── Category Anchor Navigation (Bestsellers, Main Course, Breads, Desserts)
      └── Customizable Add-to-Cart with Stepper (+/-)
      │
      ▼
  [Cart & Checkout Screen]
      ├── "Frequently Bought Together" Co-occurrence Upsell (e.g., Biryani -> Raita & Gulab Jamun)
      ├── Delivery Tip Chips (₹20, ₹30, ₹50) & Cooking / No-contact Notes
      ├── Section 9(5) CGST Dual-Tax Bill Breakdown:
      │     • Food Subtotal
      │     • 5% Restaurant Food GST (Collected by platform under Sec 9(5))
      │     • Delivery Fee
      │     • Platform Service Fee (₹5.00)
      │     • 18% Platform Service GST (On delivery + platform fee)
      │     • Grand Total (Stored in Integer Paise)
      └── Payment Trigger (Razorpay SDK / UPI Intent)
      │
      ▼
  [Live Order Tracking & Handover]
      ├── Multi-State Real-Time Stepper:
      │     Order Placed ──► Kitchen Accepted ──► Preparing ──► Rider Assigned ──► Picked Up ──► Delivered
      ├── Prominent 4-Digit Handover OTP Screen (Anti-fraud verification)
      └── Live Map with Animated Smooth-Interpolated Rider Marker (Socket.io over Redis)
```

### Key Differences & Best-of-Breed Synthesis:
| Feature | Swiggy Implementation | Zomato Implementation | Bocardo Monorepo Standard |
| :--- | :--- | :--- | :--- |
| **Hyperlocal Discovery** | H3 Hexagonal spatial indexing (resolution 8/9). | S2 geometry / PostGIS radial distance. | **PostgreSQL 16 + PostGIS `ST_DWithin` geography queries** with Redis spatial geogrid caching. |
| **Cart Upselling** | "Complete your meal" tray sliding from bottom. | "People also ordered" horizontal scroller. | **Co-occurrence matrix (`dish_pair_associations`)** recommending complementary items based on historical pair frequency. |
| **Tax Compliance** | Itemized dual tax split under CGST Section 9(5). | Single line "Taxes & charges" expandable sheet. | **Explicit Dual-Tax Invoice Model** separating Food GST (5%) from Platform Service GST (18%) with integer paise math. |
| **Anti-Fraud Delivery** | Swiggy Daily / Instamart 4-digit PIN for high-value orders. | Delivery confirmation OTP prompted at door. | **Mandatory 4-Digit Handover OTP (`delivery_otp`)** generated server-side, visible exclusively to customer, required by rider to complete delivery. |

---

## 2. Restaurant / Hotel Partner Flow: Swiggy Partner vs. Zomato Restaurant Partner

```
[Hotel Partner Live KOT Flowchart]

  Incoming Socket Event `restaurant:new_order`
      │
      ▼
  [Looping High-Volume Audio Alarm]
      ├── Uses Android `STREAM_ALARM` channel to bypass silent / DND mode
      └── Loops non-stop until kitchen staff physically taps "Accept Order"
      │
      ▼
  [120-Second Ticking Ghost Restaurant Safeguard]
      ├── Visible countdown timer on incoming order card
      └── If timer reaches 0s without acceptance:
            • Order status updated to `CANCELLED_BY_SYSTEM`
            • Razorpay instant refund executed automatically
            • Restaurant marked `is_accepting_orders = FALSE`
      │
      ▼
  [Kitchen Staff Taps "Accept Order"]
      ├── Alarm audio terminates immediately
      ├── Order moves from "Incoming" column to "Preparing" column
      └── [ESC/POS Thermal Printing Queue Engine]
            ├── Formats 58mm / 80mm Kitchen Order Ticket (KOT)
            ├── If printer online: Prints instantly via Bluetooth / USB
            └── If printer offline / paper jam:
                  • Queues in local SQLite table
                  • Displays sticky persistent banner: "Printer Disconnected"
                  • Provides manual "Reprint KOT" button
      │
      ▼
  [Food Ready for Pickup]
      ├── Kitchen marks "Ready for Pickup"
      └── Triggers rider assignment / notifies waiting delivery partner
```

---

## 3. Delivery Rider Flow: Swiggy Delivery Partner vs. Zomato Delivery Partner

```
[Rider Assignment & Navigation Flowchart]

  Rider Toggles "Go Online" in Rider App
      │
      ▼
  [Foreground GPS Tracking Engine Activated]
      ├── Emits coordinate packet every 3 seconds to Fastify Socket gateway
      ├── **Anti-Cheat Mock GPS Rejection:**
      │     Evaluates `isMocked === true` or erratic velocity spikes (>120 km/h)
      │     Rejects fake GPS packets immediately
      └── **In-Memory Redis Throttling:**
            `SET rider:loc:<riderId> '{"lat":..,"lng":..}' EX 30`
            Broadcasts to Socket room `order_tracking:<orderId>`
            *Zero continuous writes to PostgreSQL disk!*
      │
      ▼
  [Order Ready for Dispatch]
      │
      ▼
  [Sequential 1-to-1 Rider Dispatch Engine]
      ├── PostGIS query finds single nearest online rider within 4 km
      ├── Emits `dispatch:offer` with strict **30-Second Countdown**
      ├── If Rider Accepts:
      │     • Order locked: `rider_id = riderId`, status `RIDER_ASSIGNED`
      └── If Rider Declines or 30s Expires:
            • Rider appended to `rejected_rider_ids`
            • Dispatch engine cascades to next nearest candidate
      │
      ▼
  [Active Delivery Navigation]
      ├── Step 1: Navigate to Restaurant ──► Tap "Arrived at Restaurant" ──► Tap "Order Picked Up"
      ├── Step 2: Navigate to Customer Doorstep ──► Tap "Arrived at Customer"
      │     *(Customer phone is masked: `+91 98*** **210`)*
      └── Step 3: Doorstep Handover & Anti-Fraud Verification:
            • Rider asks customer for their 4-digit OTP
            • Rider inputs OTP into Rider App
            • Server validates OTP against PostgreSQL order record
            • Status transitions to `DELIVERED`, rider profile freed for next order
```

---

## 4. Platform Admin Ops & Financial Settlements

```
[Admin Operations & Settlement Lifecycle]

  Delivered Orders Accumulate in PostgreSQL
      │
      ▼
  [Indian Tax Compliance: Section 9(5) CGST Separation]
      ├── Restaurant Food Invoices (Issued on behalf of restaurant at 5% GST)
      └── Platform Service Invoices (Issued by Bocardo platform at 18% GST)
      │
      ▼
  [Weekly Offline Settlement Engine (Sunday Midnight Cron)]
      ├── Calculates Net Payout per Partner:
      │     Net Payout = Food Subtotal - Commission (15%) - TCS (1%) - TDS (1%) - Refunds
      └── Records created in `settlements` table with status `PENDING`
      │
      ▼
  [Admin Ops Portal Action]
      ├── Admin filters pending settlements
      ├── Clicks "Export Bank Transfer CSV"
      │     CSV Columns: Beneficiary Name, Account Number, IFSC Code, Amount (Paise / INR), Narrative
      ├── Admin executes batch transfer via Corporate Net Banking (HDFC, ICICI, etc.)
      └── Admin enters Bank UTR (Unique Transaction Reference) in Dashboard:
            • Settlement status transitions from `PENDING` to `PAID`
            • Linked orders marked settled with audit timestamp
```
