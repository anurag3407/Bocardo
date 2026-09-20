# 12 — Hotel Partner App Guide (`apps/hotel`)

Expo (Android-first, tablet-optimized), KOT-centric. Package id `in.bocardo.hotel`.

## Screens & Services

| Piece | File | Purpose |
|---|---|---|
| KOT board | `app/index.tsx` | 4 columns: Incoming / Preparing / Ready for Pickup / Dispatched. Live via `restaurant:new_order` + `order:status:update` sockets. |
| Menu 86-ing | `app/menu.tsx` | Instant `toggleDishAvailability` — sold-out items disappear from customer app immediately |
| Alarm | `services/alarm.ts` | Loops `STREAM_ALARM` until "Accept Order" tapped (cannot be swiped away silently) |
| Printer | `services/printer.ts` | ESC/POS 58/80mm KOT formatting, **SQLite offline queue**, auto-replay on reconnect, "Reprint Duplicate KOT" |

## Operational Rules

- **120s ghost countdown**: each incoming order shows a ticking ring; at 0 the server auto-cancels + refunds + flips the restaurant offline. Staff must tap Accept before it expires. (Server-side: durable BullMQ job — survives API restarts.)
- Accept → auto-print KOT. Prep done → Ready for Pickup (this triggers rider dispatch).
- Cancellations by kitchen (`PREPARING` or earlier) auto-refund the customer — use sparingly; cancellation rate is surfaced to ops.

## Hardware Notes

- Thermal printers: pair via Bluetooth/LAN; the printer service queues in SQLite so a paper jam never loses a KOT.
- Keep the tablet plugged in + app foregrounded; enable Android "keep screen on" in kiosk deployments.
