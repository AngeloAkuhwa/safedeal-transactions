
# /admin/disputes — Correction Plan (match approved reference)

Goal: bring the existing `/admin/disputes` page into close visual + data parity with the approved mockup. No new backend logic, no new write paths. This is a correction pass on layout, mapping, and labels.

---

## Sidebar — no changes

`AdminSidebar.tsx` already includes the previously-missing items in their correct groups:

- Overview: Dashboard, **Analytics**, **Reports**
- Operations: Transactions, Disputes, Identity, Users, Investigation
- Financial: Escrow, Payouts, Payments, Money Tracing, **Refunds**
- Risk & Compliance / Support & Tools / Settings: unchanged

No structural changes, no renames, no reordering this pass.

---

## 1. Page shell — full-width admin workspace

`src/pages/AdminDisputes.tsx`

- Render header inside `AdminLayout` with `hideDefaultHeaders` (already done) but **drop the centered/narrow padding**. Replace `p-4 md:p-6 space-y-6` with a full-width shell:
  ```
  <main className="min-h-screen w-full bg-background">
    <AdminPageHeader …/>
    <div className="w-full max-w-none px-6 lg:px-8 py-8 space-y-8">
      <KpiStrip …/>
      <FiltersCard …/>
      <QueueTableCard …/>
    </div>
  </main>
  ```
- No `max-w-7xl`, no centered container. KPI strip and table must occupy the full available content width.

---

## 2. Header — match approved order and tone

Extract a small `AdminPageHeader` block inside the file (no new file required):

- Surface: `bg-card border-b border-border px-6 lg:px-8 py-6`
- Left: H1 "Dispute Resolution Queue" + subtitle "Live dispute triage and case management"
- Right (in this exact order): **Live sync** pill (green pulse when fresh) → **Export** → **Open Investigation**
- Remove the standalone "Refresh" button; collapse refresh into the Live sync pill icon (matches reference)
- Buttons: outline for Export, solid primary blue for Open Investigation

---

## 3. KPI strip — 6 wide cards

`KpiStrip` component (already in file) — restyle, do not rebuild:

- Grid: `grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4`
- Card: `rounded-xl border border-border bg-card p-6 hover:border-blue-500/40 transition`
- Layout per card: icon tile top-left (40×40, rounded-lg, tonal bg) on one row with the **large number top-right** (`text-3xl font-semibold`); label underneath (`text-sm font-medium`); sub line (`text-xs text-muted-foreground` or accent for emphasis cards)
- Tones (icon tile + number color):
  - Open Disputes → orange
  - Awaiting Seller → amber/yellow
  - Under Review → blue
  - Overdue → red (sub: "Immediate attention" in red)
  - Resolved Today → emerald (sub: "+N from target")
  - Escalated → purple (sub: "Senior review")
- Card click applies the matching `quick` filter (already wired). Active card gets `ring-1 ring-blue-500/40`.

---

## 4. Queue Filters — restore titled section

Replace the current flat filters block with a labeled card:

- Card: `rounded-xl border border-border bg-card p-6 space-y-4`
- Row 1: left side label `Queue Filters` (`text-base font-semibold`) + quick chips with counts pulled from KPI payload — **Overdue (N)**, **Open (N)**, **Awaiting Seller (N)**, **Under Review (N)**, **Escalated (N)**, **Resolved**, **All**. Right side: `Advanced Filters` toggle button.
- Active chip: solid primary blue. Overdue chip uses red surface, Open uses orange surface, others use neutral. Counts use `data.kpis.*`.
- Row 2 (always visible): `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3`
  - Search (col-span-1 on lg, with leading icon, placeholder "Search disputes, transactions, users…")
  - All Dispute Reasons select
  - All Agents select (populated from `data.filters.agents`; show "All Agents" until backed by real data)
  - All Amount Ranges select (`lt_100k`, `100k_1m`, `1m_5m`, `gt_5m` → friendly labels)
- All filters remain URL-synced via existing `useSearchParams`.

---

## 5. Active Dispute Queue table — balanced columns + richer rows

Card: `rounded-xl border border-border bg-card overflow-hidden`

- Card header bar: title "Active Dispute Queue" left; "Last updated: X ago" + refresh icon right; bottom border.
- Table head: `bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground`, columns and approximate widths:

  | Col | Width |
  |---|---|
  | Priority | 10% |
  | Dispute | 18% |
  | Parties | 18% |
  | Amount | 12% |
  | Status | 13% |
  | SLA | 13% |
  | Agent | 9% |
  | Actions | 7% |

- Rows: `py-4 px-4 border-b border-border/60 hover:bg-muted/30 relative`; left-edge accent strip via `before:absolute before:inset-y-0 before:left-0 before:w-1` colored by priority.
- Per-cell content:
  - Priority: colored dot + uppercase label (`text-xs font-bold`)
  - Dispute: `#DIS-XXXXXXXX` (link → `/admin/disputes/:id`), item title, `TXN-…` (muted, link → `/admin/transactions/:id`)
  - Parties: stacked buyer + seller with avatar initials, optional verified badge
  - Amount: `formatMoney(amount, "NGN")` (₦676,000.00 format) + reason label below in muted text
  - Status: `<DisputeStatusBadge>` driven by `deriveDisputeDisplay`; clean money-status line beneath (see §7)
  - SLA: humanized line + `Due: Jan 23, 16:00` (Africa/Lagos)
  - Agent: avatar + name, or `Unassigned` chip
  - Actions: primary `Review` button (orange for active, emerald `View Resolution` for resolved) + kebab `RowActionsMenu` (Open detail, Resolve dispute, Request more info, Open investigation, Add note, Export row)

Mobile (<lg): hide the table, render `DisputeQueueCard` stack — dispute code, item, txn code, priority + status badges, parties, amount + reason, SLA, agent, Review button, kebab.

---

## 6. Amount mapping fix (₦0.00 bug)

`supabase/functions/admin-disputes-queue/index.ts`

The embed `pricing:transaction_pricing (buyer_total_amount, currency_code)` returns an array — current code reads `pricing[0]?.buyer_total_amount`, which is correct, but the embed silently drops when PostgREST can't resolve the FK name. Switch to a two-step fetch to guarantee data:

1. Keep the disputes + transactions + buyer/seller embed.
2. After fetching rows, batch-query `transaction_pricing` and `transaction_items` directly by `transaction_id IN (...)` and merge by `transaction_id`.
3. Amount fallback chain:
   - `transaction_pricing.buyer_total_amount`
   - else `item_amount + platform_fee_amount + processing_fee_amount`
   - else `0`
4. Currency defaults to `NGN`. Never emit USD unless `currency_code` is literally `USD`.

This eliminates the silent `0.00` rendering.

---

## 7. Clean money/dispute labels

`src/pages/AdminDisputes.tsx` — fix `MONEY_STATUS_LABEL` (keys currently don't match DB enum):

```ts
const MONEY_STATUS_LABEL: Record<string, string> = {
  not_secured: "Not Secured",
  payment_pending: "Payment Pending",
  funds_held_in_escrow: "Held in Escrow",
  funds_frozen: "Funds Frozen",
  funds_pending_release: "Awaiting Release",
  funds_releasing: "Release Processing",
  funds_released: "Released",
  refund_pending: "Refund Pending",
  refund_issued: "Refunded",
};
```

Render the money status as a small subline under the dispute status badge, never raw. Unknown values fall back to a humanized `replace(/_/g, " ")` titlecased label.

Dispute status labels stay routed through `resolveDisputeLabel` / `deriveDisputeDisplay` (already correct). Resolved rows continue to never show "In Dispute"; seller-favor → Awaiting Release; buyer-favor → Refund Pending; partial → Partially Resolved; frozen close-no-action → Manual Action Required.

---

## 8. Interactions (unchanged contracts, verified)

- KPI card click → set `quick` URL param
- Quick chip click → set `quick` URL param
- Row click + Review → `/admin/transactions/:transactionId?tab=dispute&disputeId=:disputeId`
- View Resolution → `…?tab=resolution&disputeId=…`
- Kebab Resolve dispute → opens existing `ResolveDisputeDialog`, submits via `resolveDispute()` (existing `admin-transaction-actions` → `resolve_dispute_atomic`). No Paystack call.
- Export → existing `exportAdminDisputesQueue` with current filters.

---

## 9. Tests

Extend `src/components/admin/disputes/__tests__/DisputeQueueDisplay.test.ts`:

- `funds_held_in_escrow` → "Held in Escrow"
- `refund_issued` → "Refunded"
- Amount fallback: when `buyer_total_amount` is null but components exist, sum is used
- NGN formatting: `formatMoney(676000, "NGN")` matches `/676,000\.00/`

Existing seller-favor / buyer-favor / never-"In Dispute" / NGN 2dp tests stay.

---

## Files

**Edited only — no new files**
- `src/pages/AdminDisputes.tsx` — full-width shell, header order, KPI restyle, labeled Queue Filters card, balanced table column widths, fixed `MONEY_STATUS_LABEL`, mobile card variant
- `supabase/functions/admin-disputes-queue/index.ts` — two-step amount fetch with fallback chain
- `src/components/admin/disputes/__tests__/DisputeQueueDisplay.test.ts` — extra label + amount cases
- `.lovable/plan.md` — replaced with this corrected plan

**Reused unchanged**
- `src/services/admin-disputes.service.ts`
- `src/services/admin-transaction-actions.service.ts`
- `src/components/admin/transactions/ResolveDisputeDialog.tsx`
- `src/lib/dispute-display-status.ts`, `src/lib/format.ts`, `src/lib/status-labels.ts`
- `src/components/admin/AdminSidebar.tsx`, `useAdminNav.ts`, `AdminLayout.tsx`

---

## Acceptance

- `/admin/disputes` renders full-width inside Admin Portal; header matches approved order (Live sync → Export → Open Investigation).
- KPI strip shows 6 wide cards with correct tones; click filters the queue.
- Queue Filters card is labeled, with quick chips showing live counts and a 4-column filter row.
- Active Dispute Queue uses balanced column widths, priority accent strip, stacked parties, NGN amounts in `₦676,000.00` format with reason underneath.
- Money status renders as "Held in Escrow", "Refund Pending", etc. — never raw `funds_held_in_escrow`.
- Resolved rows use derived display status; never show "In Dispute".
- Amount mapping no longer collapses to `₦0.00` when pricing exists.
- Review/View Resolution route correctly; Resolve Dispute reuses existing central flow with no Paystack call.
- Mobile uses stacked cards.
- Sidebar structure is unchanged from current state.
