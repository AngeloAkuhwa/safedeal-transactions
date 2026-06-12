# KPI Cards — Icon & Badge Parity

Match `src/components/admin/payouts/PayoutSummaryCards.tsx` to the reference HTML exactly.

## Icon swaps (lucide-react)
| Card | Current | Change to | Matches |
|---|---|---|---|
| Pending Payouts | `Clock` | keep | `fa-clock` |
| Processing | `RotateCw` | **`RefreshCw`** | `fa-arrows-rotate` (two-arrow sync) |
| Failed Payouts | `AlertTriangle` | keep | `fa-triangle-exclamation` |
| Paid Today | `CheckCircle2` | **`Check`** | `fa-check` (plain check, no circle) |
| Paid This Week | `CalendarDays` | keep | `fa-calendar-week` |
| Avg Payout Time | `Timer` | keep | `fa-stopwatch` |

## Badges — always visible
Reference design always shows the top-right badge. Currently the first three cards (Pending, Processing, Failed) only render the badge when `delta_24h > 0`, so empty backend data leaves the corner blank.

Change `fmtDelta` so the badge always renders for those three cards, showing `+N` (including `+0`) using `delta_24h ?? 0`. Tone/colors unchanged. The Today / Week / Avg labels on the other three cards already always render.

## Out of scope
- Card layout, values, currency, spacing — unchanged
- No business-logic or backend changes
