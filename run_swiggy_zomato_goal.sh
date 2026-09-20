#!/bin/bash
set -e

cd /home/ubuntu/Bocardo

source /home/ubuntu/.tokenharbor/env.sh

PROMPT="Objective: Transform this 4-app food delivery monorepo (Customer, Hotel/Kitchen, Rider, Admin, and Backend API) into a complete, production-hardened Swiggy and Zomato class platform. Address every architectural and user experience gap identified in docs/swiggy_zomato_flow_analysis.md and plan.md.

Execute the following systematically:

1. CUSTOMER EXPERIENCE (apps/customer):
   - Menu Customization: Support item variants (size/portion) and multi-select add-on groups (mandatory/optional) with stepper (+/-).
   - Food Preferences & Search: Veg / Non-Veg / Egg badge filters, category anchor navigation bar, and debounced instant dish search.
   - Transparent Indian Checkout Bill: Display food subtotal, 5% Section 9(5) Food GST, delivery fee, platform fee (₹5.00), 18% service GST, packaging fee, and tip chips (₹20, ₹30, ₹50) with cooking notes.
   - Live Order Tracking: Animated multi-stage order tracking stepper with real-time rider location updates over Socket.io, plus prominent display of the 4-digit delivery handover OTP.

2. RESTAURANT & KITCHEN OPERATIONS (apps/hotel):
   - Incoming Order Audio Alert: Continuous looping alarm for new orders until the kitchen taps 'Accept'.
   - Item 86ing: One-tap toggle to mark dishes out-of-stock with auto-reset timers.
   - Prep Time Adjustment: Buttons to extend prep time (+10m, +15m) broadcasting instant ETA updates to customer and rider.
   - Thermal Printer Integration: KOT ticket generation with SQLite buffer fallback for dropped Bluetooth/LAN printer connections.

3. RIDER DISPATCH & DELIVERIES (apps/rider):
   - Dispatch Offer Modal: Full-screen overlay with 30-second countdown timer and sound alert for new assignments.
   - Doorstep Handover Verification: Require rider to input the customer's 4-digit OTP to complete delivery.
   - Geofence Arrival Validation: Reject 'Arrived at Restaurant' unless within 100m of restaurant coordinates; reject 'Arrived at Customer' unless within 100m of customer address.
   - Throttled GPS Streaming: Emit smooth, battery-efficient GPS coordinates every 3-5 seconds, rejecting mocked/spoofed locations.

4. REAL-TIME ENGINE & SETTLEMENTS (apps/api & apps/admin):
   - Sequential 1-to-1 Dispatch: Auto-offer orders to the closest idle rider within 3km for 30s before cascading to the next candidate.
   - Ghost Restaurant Auto-Refund Worker: Auto-cancel and refund via Razorpay if unaccepted for 5 minutes.
   - Multi-Vendor Razorpay Route Splits: Automate restaurant net transfer, platform commission, and rider payouts.
   - Admin Operations Radar: Live bottleneck monitoring, delayed order alarms, and Section 9(5) GST settlement CSV export.

5. VERIFICATION:
   - Run tests (pnpm test) and build checks (pnpm build) to ensure clean compilation.
   - Write a complete summary of all completed features into SWIGGY_ZOMATO_IMPLEMENTATION.md."

echo "============================================================" | tee -a swiggy_zomato_goal.log
echo "🚀 Starting Swiggy/Zomato Production Goal via Token Harbor DeepSeek V4.1 at Sat Sep 19 10:38:09 IST 2026" | tee -a swiggy_zomato_goal.log
echo "============================================================" | tee -a swiggy_zomato_goal.log

codex exec --dangerously-bypass-approvals-and-sandbox "$PROMPT" < /dev/null 2>&1 | tee -a swiggy_zomato_goal.log

echo "============================================================" | tee -a swiggy_zomato_goal.log
echo "🏁 Swiggy/Zomato Goal Finished at Sat Sep 19 10:38:09 IST 2026" | tee -a swiggy_zomato_goal.log
echo "============================================================" | tee -a swiggy_zomato_goal.log
