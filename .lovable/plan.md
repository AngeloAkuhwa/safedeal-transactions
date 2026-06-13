
# Plan: port Escrow HTML reference exactly into the React page

Scope is presentation only. All data wiring, types, services, and the edge function stay as-is. Currency stays NGN (the HTML is USD; we keep ₦ per project memory). Sidebar/layout stays (project uses `AdminLayout`, not the HTML's standalone aside).

## 1. Re-do alert categories to match the reference

Replace the current 4 alert groups (Frozen Too Long, Mismatch with Provider, High Value Held, Dispute Stalled) with the reference's exact 4:

1. **Frozen Too Long** — red, `Clock` icon, items show `Lock` icon + code + amount + "Frozen Nd"
2. **Release Overdue** — orange, `HourglassIcon`, items show `AlertTriangle` + code + amount + "Overdue Nd"
3. **Stuck Escrow** — purple, `Pause` icon, items show `PauseCircle` + code + amount + "Idle Nd"
4. **State Mismatch** — yellow, `GitCompare` icon, items show right-side two-line label ("Released ≠ Paid" / "Verify reconciliation")

Add `View all N <type> alerts →` footer link per card (navigates to filtered records list).

Add the bottom alert-thresholds bar inside the panel:
`🔔 Alert thresholds: Frozen >30d | Overdue >5d | Idle >15d | Any state mismatch` with `Configure Alerts` button on the right (kept disabled until backend exists).

Critical/Warning pills: solid red/orange chips with pulsing dot on Critical (matches reference exactly).

### Service / edge function impact
The reference categories don't all map to current `EscrowAlerts` shape. Extend the type + edge function aggregator to return:
- `frozen_too_long` (unchanged)
- `release_overdue` (replaces `provider_mismatch` in UI; compute from pending_release past expected release date)
- `stuck_escrow` (new; no state change > 15d)
- `state_mismatch` (replaces `dispute_stalled`/`high_value_held` slot; compute from `escrow_states` vs `transactions.money_status` inconsistencies, plus held≠balance from ledger)
- keep `counts: { critical, warning }`

Old fields stay in the response for back-compat but stop being rendered. (No UI consumer outside this page.)

## 2. Page header to match reference

- Subtitle changes to: `Real-time financial control center for all platform escrow funds`
- Replace the current Live/Updated/Refresh/Export/Audit-Report row with the reference's compact header strip:
  - Left: `● Live` pill + `Last updated HH:MM` pill (clock icon)
  - Right: `Export Report` (slate) + `Refresh Data` (emerald primary) — both wired to existing refetch
- Remove the standalone "Audit Report" button (not in reference).

## 3. Escrow Records table — action buttons

Replace the single `Open` button with the reference's 5-icon action row, all 36x36 rounded slate buttons with hover accent colors and tooltips:

1. View Transaction → `/admin/transactions/:id` (file-invoice icon → `FileText`)
2. View Escrow Record → same route + `#escrow` anchor (vault icon → `Vault`)
3. Active Dispute → `/admin/disputes/:disputeId` (only highlighted red when `r.flagged`, otherwise neutral) — `Scale`
4. Investigate → `/admin/investigation?tx=:id` (disabled if route absent) — `SearchCheck`
5. Add Internal Note → opens existing admin note modal if available, else disabled — `StickyNote`

State cell: add the reference's two sub-lines under the badge when present:
- `🔗 Dispute #<code>` when transaction has linked dispute
- `⏳ Admin review` / `✓ Buyer confirmed` / `⏳ Auto-release in Xh` depending on money_status

Mobile card layout: keep but add the same 5-action footer row (compact).

## 4. KPI cards

Currently match the reference structurally. Minor polish: keep ₦ formatting but stop truncating large values with `…` — use the reference's compact formatter (`₦3.1M`, `₦124.8K`) inside the big number when width is tight. Sub-line + delta percentage stay.

## 5. Filters bar

Already close to reference. Tweak only:
- Add `Flagged Only` option to Special Flags
- Search placeholder updates to: `Search by transaction code, buyer, seller, or payment reference...`

## 6. Files touched

- `src/pages/AdminEscrow.tsx` — header strip, subtitle, button wiring
- `src/components/admin/escrow/EscrowAlertsPanel.tsx` — 4 new categories, thresholds footer
- `src/components/admin/escrow/EscrowRecordsTable.tsx` — 5-icon action row, state sub-lines, mobile parity
- `src/components/admin/escrow/EscrowKpiCards.tsx` — compact formatter
- `src/components/admin/escrow/EscrowFilters.tsx` — new option + placeholder
- `src/services/admin-escrow.service.ts` — extend `EscrowAlerts` type
- `supabase/functions/admin-escrow-overview/index.ts` — compute the 4 alert categories

## Technical notes

- Icons: use `lucide-react` equivalents (FontAwesome isn't in the project). Mapping above.
- Colors: continue using Tailwind palette classes inline (matching existing file style; this page already deviates from the semantic-token convention to mirror the HTML mock — keeping that approach for visual parity).
- No new dependencies. Recharts stays for the charts (visuals already match the reference closely enough; no change).
- Mobile-card actions are not in the HTML reference but are kept so the page stays usable on small screens.

## Expected result

The Escrow tab matches the uploaded reference 1:1 in header strip, KPI grid, alert categories with thresholds footer, filters, and records table with the 5-icon action row — all wired to the real data already returned by the aggregator.
