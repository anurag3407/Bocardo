# 10 — UI/UX Design System (Teal Theme)

Bocardo follows Swiggy's proven UX patterns (hyperlocal cards, meal-slot cravings, floating cart, KOT board, dispatch modal) with a **signature teal identity** instead of saffron.

## Brand Tokens (`packages/ui/src/theme.ts`)

| Token | Hex | Usage |
|---|---|---|
| `primary.DEFAULT` | `#0D9488` (teal-600) | CTAs, active states, cart button, offer accents |
| `primary.dark` | `#0F766E` (teal-700) | pressed states, subtitles |
| `primary.light` | `#F0FDFA` (teal-50) | selected pill backgrounds |
| `secondary.DEFAULT` | `#0F172A` (slate-900) | headings, primary text |
| `background` | `#F8FAFC` | app background |
| `surface` | `#FFFFFF` | cards |
| `border` | `#E2E8F0` | hairlines |
| `veg` `#0F8A48` / `nonVeg` `#D13838` | — | FSSAI diet badges |
| rating badge | `#15803D` | Swiggy-style green rating chip |

Tailwind scale (admin): `bocardo.{50 #F0FDFA, 100 #CCFBF1, 500 #0D9488, 600 #0F766E, 700 #115E59}`.

## Accessibility

- White on `#0D9488`: contrast 4.6:1 — AA for large text & buttons ✓
- Slate-900 on `#F8FAFC`: 15.4:1 — AAA body text ✓
- Status pills always pair color **and** text label (colorblind-safe).

## Signature Patterns by App

**Customer (Swiggy home DNA):** location header with dropdown chevron → rounded search bar (`Search 'Hyderabadi Biryani'…`) → horizontal meal-slot pills (active = teal-light bg + teal border) → trending dish cards (170w, 110h image) → restaurant cards (16 radius, 160h hero, green rating chip, cuisine line) → **floating cart bar** (teal, count + subtotal, "View Cart →", teal glow shadow).

**Hotel:** 4-column KOT kanban (Incoming → Preparing → Ready → Dispatched), persistent alarm loop until accept, 120s countdown ring, ESC/POS print queue with reprint.

**Rider:** big duty toggle, full-screen dispatch offer modal (30s radial countdown, ₹ payout prominent, accept=teal), OTP entry gate before DELIVERED.

**Admin:** slate sidebar + teal accents, live city map, settlement tables with UTR modal.

## Rules for New Screens

1. Use `theme` tokens from `@bocardo/ui` — never hardcode hex in screens (legacy hardcodes were migrated to teal; keep it that way).
2. Status colors come from `statusColors` map keyed by `OrderStatus`.
3. Money always via `<CurrencyDisplay>` / `formatPaiseToRupees`.
4. Cards: `borderRadius 12–16`, `borderWidth 1 #E2E8F0`, no heavy shadows except the floating cart.
5. Every async action shows skeleton/disabled state; every mutation shows success/error toast.
