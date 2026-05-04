
## Issues

1. **Flags column shows only "—"** — The table "Flags" cell only renders the `riskLevel` badge. Since most rows have `riskLevel: "clean"`, they fall through to the dash. The backend already returns a rich `flags[]` array (`frozen`, `admin_frozen`, `overdue`, `payment_failed`, `payout_failed`, `risk_flagged`, `escalated`, `high_risk`, `fraud_watch`) in `admin-transactions-monitor`, but the UI ignores it.
2. **Reading-mode floater overlaps pagination & bottom nav** — `AdminReadingModeControl` renders fixed at:
   - desktop: `bottom-5 right-5 z-40` → sits directly on top of the right-aligned `Prev / Next` buttons in the table footer.
   - mobile: `bottom-4 left-1/2 z-50` → sits above (and overlaps) the fixed bottom navigation (`z-30`, ~64 px tall).

## Fix Plan (single file each)

### A. `src/pages/AdminTransactions.tsx` — populate Flags

1. Add `SECONDARY_FLAG_META` map for the operational flags returned by the edge function: `frozen`, `admin_frozen`, `overdue`, `payment_failed`, `payout_failed`, `risk_flagged`, each with a sensible label, color class, and icon (Snowflake / Clock / ShieldAlert / Flag — all already imported).
2. Add a `buildFlagBadges(row)` helper that:
   - Starts with the `riskLevel` badge when not `clean` (Escalated / High Risk / Fraud Watch).
   - Appends secondary flags from `row.flags`, deduped (collapse `frozen` ↔ `admin_frozen`, drop `risk_flagged` when a risk-level badge is already present).
   - Caps the visible list at **2 badges**; any remainder becomes a `+N` chip with a tooltip listing the rest, so the row stays uncluttered.
3. Replace the current `t.riskLevel === "clean" ? "—" : <Badge .../>` block in the desktop table cell with:
   - `badges.length === 0` → keep the `—` placeholder.
   - Otherwise render the badges in a `flex flex-wrap gap-1` container.
4. Mirror the same helper on the mobile card badge row so badges like Overdue / Payment Failed surface there too.

### B. `src/components/admin/AdminReadingModeControl.tsx` — keep floater clear of controls

1. **Desktop floater** (`variant === "desktop-floater"`): move from `bottom-5 right-5` to `bottom-5 left-5` (away from right-aligned pagination), keep `z-40`. Add `pointer-events-auto` wrapper so it doesn't trap clicks elsewhere (already isolated, no behavior regression).
2. **Mobile floater** (`variant === "mobile-floater"`): raise it above the fixed bottom nav by adding `bottom-[calc(env(safe-area-inset-bottom)+72px)]` (nav is ~64 px + safe-area). Keep `z-50` so it stays above the nav itself but no longer overlaps page content/pagination.
3. No layout regressions on pages without bottom nav — extra offset is purely vertical and small.

## Acceptance

- Desktop "Flags" column shows real chips per row (e.g. `Frozen`, `Overdue`, `Payment Failed`) and `—` only when truly clean.
- Mobile cards display the same operational badges in the existing badge row.
- Scrolling to the bottom of `/admin/transactions`, the Prev / Next buttons are fully clickable and **not** covered by the Reading Mode pill.
- Mobile Reading Mode pill sits above the bottom navigation and never sits on top of pagination or card content.
- No backend changes; no new dependencies; only the two files above are touched.
