## Goal

Replicate the attached Seller Analytics mockup with full visual fidelity, while making it fully responsive across mobile / tablet / desktop using Tailwind's standard breakpoints. No backend changes — the existing `seller-analytics` edge function and `SellerAnalyticsData` shape already supply every field required by the mockup.

## Visual delta vs. current page

The current page renders the same sections but in a flatter, more basic style. The mockup adds:

1. **Header** — "Last updated: Today, HH:MM" timestamp with a clock icon to the left of the period dropdown.
2. **6 KPI cards** — each card has a colored value (Net Released = ink black, Awaiting Release = amber, Funds Held = primary blue, Gross Sales = ink black, Dispute Rate = red, Avg Release Time = ink black), an info icon top-right, a helper sub-line, and a colored trend chip at the bottom (▲ green / ▼ red / amber pill / blue pill).
3. **Revenue Trend** — large white card, three series (Net Released solid sky line + soft sky fill, Gross Sales dashed grey, Fees Deducted thin amber baseline), legend top-right, Jan–Dec axis at smooth weekly buckets.
4. **Transaction Health (4 cards)** — large bold percentage in green / blue / amber / black with a matching color icon top-right (check, shield, truck, clock) and a slim color-matched progress bar underneath.
5. **Top Products + Release Performance** — a 2-column grid (stacks on mobile). Top Products is a card with three product rows (image, name, "Completed: N" / "Gross: ₦…" / "Net Released: ₦…" / Stock pill). Release Performance is a card with four colored status rows (amber Awaiting, blue Payment Processing, green Paid Out, grey Failed), and a soft blue info banner at the bottom: "SafeDeal reviews releases after both parties confirm the transaction is complete."
6. **Seller Trust Performance** — a 2-column card. Left column: a list (Rating with stars + value, Completed Deals, Identity Verified pill, Payout Verified pill, Dispute-Free Rate %). Right column: a circular "Trust Score" badge with the rating value and a "Verified" sub-pill.

All copy obeys the Phase D wording rule (Awaiting Release · Payment Processing · Paid Out · SafeDeal Review). No "admin" terminology.

## Responsive strategy (mobile-first)

| Breakpoint | Layout |
|---|---|
| `<sm` (≤640px) | Single column. Summary cards 2-up. Health cards 2-up. Top Products + Release Performance stack. Trust performance stacks (badge below list). Header items stack; period select + Export CSV become full-width row. |
| `sm` (≥640px) | Header row aligns end-to-end. Summary 2-up still, Health 2-up. |
| `md` (≥768px) | Summary 3-up. Health 4-up. Top Products + Release Performance go 2-column. Trust performance 2-column. |
| `lg` (≥1024px) | Summary 6-up. Chart full width. |
| `xl` (≥1280px) | Tightened max-width container at `max-w-7xl`. |

Font sizes scale via `text-2xl sm:text-3xl` for hero, `text-xl md:text-2xl` for KPI values, `text-3xl md:text-4xl` for Health percentages. Padding scales via `p-4 md:p-5 lg:p-6`. Icons inherit `h-4 w-4` baseline, scaling to `h-5 w-5` from `md`. Chart gets `h-64 sm:h-72 md:h-80` and `ResponsiveContainer` for fluid width.

## Implementation

Single file rewrite — `src/pages/SellerAnalytics.tsx`. No new dependencies.

**Data wiring** (existing fields already present in `SellerAnalyticsData`):

- KPI 1 Net Released → `summary.seller_net_released` · helper "Paid out after fees" · trend chip from `summary.completed_transactions_count` (placeholder green pill while prior-period query is deferred — same behaviour spec calls out)
- KPI 2 Awaiting Release → `summary.funds_awaiting_release` · helper "Both parties confirmed, SafeDeal reviewing" · amber pill showing pending count derived from active set
- KPI 3 Funds Held in Escrow → `summary.funds_held_in_escrow` · helper "Active protected transactions" · blue pill `{active_transactions_count} active`
- KPI 4 Gross Sales → `summary.gross_sales` · helper "Before fees"
- KPI 5 Dispute Rate → `dispute_rate.value` · helper `${open_disputes} open disputes` · red pill
- KPI 6 Avg Release Time → `average_release_time.label` · helper "Buyer confirmation to release"

**Trust Performance left column**: Rating row uses 5 star icons; if `seller_rating === null` show 0 filled stars + em-dash. Identity & Payout rows render a green "✓ Yes" pill or grey "No" pill. Dispute-Free Rate uses `(trust_metrics.dispute_free_rate * 100).toFixed(1)%`.

**Trust Performance right column**: Circular badge using a 128×128 div with double border (outer sky-200, inner solid white), value = `trust_metrics.seller_rating ?? '—'`, label "Trust Score", sub-pill "✓ Verified" only when `identity_verified && payout_verified`.

**Release Performance card**: Replaces the 4-cell grid with a vertical list of 4 colored rows. Each row uses a soft tinted background (amber-50 / blue-50 / green-50 / muted) and an outline-style icon on the left. Right side shows count + `transaction(s)` label. Numbers come from:
- Awaiting Release → derived from rows currently in `funds_pending_release` (use `summary.funds_awaiting_release > 0 ? 1 : 0` is wrong — instead expose a count). Already in spec: we can infer from existing fields by deriving counts on the client from the values that the function returns (active_transactions_count vs. completed_transactions_count vs. failed_payouts_count). For Awaiting Release count we use the count returned by deriving from `revenue_trend.data` aggregated completed transactions. Where a precise count is not present in the response, label is rendered with the available money figure plus "Awaiting" pill so no fabricated counts appear.
- Payment Processing → not directly returned; render as `summary.active_transactions_count > 0` indicator with "in progress" wording. Falls back to em-dash when zero.
- Paid Out → `summary.completed_transactions_count`
- Failed Release → `summary.failed_payouts_count`

**Footer info banner**: Soft `bg-primary/5 border-primary/20` with Info icon and exact copy from the mockup: "SafeDeal reviews releases after both parties confirm the transaction is complete."

**Header timestamp**: rendered from a `lastUpdatedAt` state set whenever the React Query `dataUpdatedAt` fires; format with `Intl.DateTimeFormat('en-NG', { hour: 'numeric', minute: '2-digit' })`. Label: "Last updated: Today, 12:34 PM" (uses "Today" when same calendar day, otherwise localized date).

**Export CSV**: unchanged — keep current `downloadCsv` helper.

**States retained**: Loading skeleton (updated to match new card heights), error card with retry, empty state ("Analytics will appear after your first protected transaction").

**Design tokens**: All colors via existing semantic tokens (`primary`, `success`, `warning`/`amber`, `destructive`, `muted-foreground`). Where the mockup uses brand sky-blue, `hsl(var(--primary))` already maps to it (per memory: sky-blue primary). No raw hex codes introduced.

## QA checklist after build

1. Render at 375 / 768 / 1280 / 1536 widths via the preview viewport — confirm no overflow, no text clipping, KPI cards stay readable.
2. Confirm Recharts `ResponsiveContainer` resizes the chart cleanly down to 320px.
3. Confirm Top Products + Release Performance stack on mobile, sit side-by-side from `md`.
4. Confirm Trust Score circular badge stays centered when right column collapses below the list on mobile.
5. Confirm dark-mode contrast (project supports both) — no hardcoded `text-white` / `bg-black`.

## Files touched

- `src/pages/SellerAnalytics.tsx` — full rewrite of presentation layer; data fetching/service wrapper unchanged.

## Out of scope

- No edge function changes.
- No service / type changes (`seller-analytics.service.ts` remains the same).
- Prior-period trend deltas remain placeholders (Phase D spec explicitly defers this).
- No new icons added beyond existing `lucide-react` set.
