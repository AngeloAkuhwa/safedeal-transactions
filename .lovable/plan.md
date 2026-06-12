## Goal
Update the 6 KPI cards in Payout Management to match `Payout_Management-11.html` lines 177-243 pixel-for-pixel: same FontAwesome-style filled icons, same hardcoded slate colors, same badge/tone, same typography. Keep all data wiring (live numbers from `summary`) intact.

## Scope
File: `src/components/admin/payouts/PayoutSummaryCards.tsx` only.
Out of scope: header, filters, tabs, table, totals, business logic, currency formatting.

## Changes

1. **Add `react-icons` dependency** (FontAwesome 6 solid set) so icons match the reference exactly:
   - `FaClock` (Pending Payouts)
   - `FaArrowsRotate` (Processing)
   - `FaTriangleExclamation` (Failed Payouts)
   - `FaCheck` (Paid Today)
   - `FaCalendarWeek` (Paid This Week)
   - `FaStopwatch` (Avg Payout Time)

2. **Rewrite `Tile` markup** to mirror reference exactly:
   ```
   <div class="bg-slate-900 border border-slate-800 rounded-xl p-6">
     <div class="flex items-center justify-between mb-2">
       <div class="w-12 h-12 bg-{tone}-500/10 border border-{tone}-500/30 rounded-lg flex items-center justify-center">
         <Icon class="text-{tone}-400 text-lg" />
       </div>
       <span class="text-{tone}-400 text-xs font-semibold bg-{tone}-500/10 px-2 py-1 rounded">{badge}</span>
     </div>
     <p class="text-slate-400 text-xs font-medium mb-1">{label}</p>
     <p class="text-white text-2xl font-bold">{value}</p>
   </div>
   ```
   - Drop `Card` wrapper; use raw `<div>` with hardcoded slate-900/slate-800.
   - Drop the `truncate` and `sub` line (reference has neither in KPI cards).
   - Use `size={18}` on FA icons to approximate `text-lg`.

3. **Tone map** stays the same 6 colors (orange/blue/red/emerald/purple/cyan) but classes are now hardcoded slate-900 card + tone-500/10 bg + tone-500/30 border + tone-400 fg — exactly as in HTML.

4. **Badges**: keep dynamic `+N` (delta) for first 3 cards and static `Today` / `Week` / `Avg` for last 3 — already correct.

5. **Skeleton state**: unchanged.

## Out of scope
- KPI numbers/values stay sourced from `summary` (live data). The HTML's `142 / 58 / 18 / $247K / $1.8M / 2.4h` are not copied as static values.
- Naira `₦` symbol stays (do not switch to `$`).

## Acceptance
- Side-by-side with reference image, each of the 6 cards has matching: card bg/border, icon glyph, icon tint box, badge color/text, label, value typography.
