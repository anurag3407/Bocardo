#!/bin/bash
set -e

cd /home/ubuntu/Bocardo

# Ensure LiteLLM proxy is active
pm2 start /home/ubuntu/litellm_proxy/ecosystem.config.js 2>/dev/null || pm2 restart litellm-proxy

export LITELLM_API_KEY="sk-litellm-local-master-key"

PROMPT="Objective: Thoroughly audit all applications (apps/) and shared libraries (packages/) in this monorepo, compare them feature-by-feature against production Swiggy industry standards (Customer App/Web, Restaurant/Kitchen App, Rider App, Admin/Settlement, and Realtime Engine), and fix all production gaps.

Steps to execute:
1. Audit the current state of apps/ and packages/ against plan.md and real-world Swiggy capabilities:
   - Customer App & Website: Live GPS order tracking, item variants/addons, GST 9(5) & packaging fee breakdown, checkout idempotency, cart validation (restaurant open/closed, inventory).
   - Restaurant App: Loud continuous order audio alert, item 86ing (out of stock toggle), prep time adjustments, thermal printer queue logic.
   - Rider App: Sequential 1-to-1 rider dispatch, doorstep OTP delivery verification, GPS geofence arrival check (within 100m).
   - Backend & Realtime: Socket.io rooms, Redis pub/sub sync, Razorpay webhook idempotency, Supabase schema hardening.
2. Write the comprehensive findings to SWIGGY_GAP_ANALYSIS.md.
3. Systematically fix all identified production gaps directly in the codebase (apps/ and packages/).
4. Run pnpm build / test checks to verify everything compiles and passes type checking.
5. Summarize all resolved items in GAPS_FIXED.md."

echo "Starting Codex autonomous run at Thu Sep 17 15:46:11 IST 2026..." | tee -a codex_goal.log
codex exec --dangerously-bypass-approvals-and-sandbox "$PROMPT" < /dev/null 2>&1 | tee -a codex_goal.log
echo "Codex run finished at Thu Sep 17 15:46:11 IST 2026" | tee -a codex_goal.log
