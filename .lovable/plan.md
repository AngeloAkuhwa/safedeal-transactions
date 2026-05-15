## Goal

Build the **Central Admin Dispute Resolution Queue** at `/admin/disputes` matching the uploaded mockup, fully wired to the existing central resolve flow (`admin-transaction-actions` → `resolve_dispute_atomic` RPC, `ResolveDisputeDialog`, `deriveDisputeDisplay`, Linked Records). Read-only aggregator only — no new write paths, no Paystack, no money movement from this page.

---

## 1. Routing & navigation

**Routes (edit `src/App.tsx`)** — added inside the existing `requireRole="admin"` block:
- `/admin/disputes` → new `AdminDisputes` page
- `/admin/disputes/:id` → tiny resolver component that fetches `disputes.transaction_id` then `navigate("/admin/transactions/" + tx + "?tab=dispute&disputeId=" + id, { replace: true })`. Preserves existing dashboard Recent Activity links.

**`src/components/admin/useAdminNav.ts`** — add `/admin/disputes` to `BUILT_ROUTES` so the existing sidebar Disputes item stops showing "Coming soon" and routes here. The dispute count badge is already wired (`badges.disputes`).

**Sidebar — add only missing items, do not restructure existing groups** (`src/components/admin/AdminSidebar.tsx`, `buildGroups`):
- Overview group: append **Analytics** (`/admin/analytics`) and **Reports** (`/admin/reports`) after Dashboard.
- Financial group: append **Refunds** (`/admin/refunds`) after Money Tracing.
- Everything else (Operations, Risk & Compliance, Support & Tools, Settings) stays exactly as it is. Fraud Detection remains under Risk & Compliance — not duplicated. Money Tracing is not renamed.
- The new entries are not in `BUILT_ROUTES`, so they keep the existing "Coming soon" tooltip until built — this matches current behavior for unbuilt items and changes nothing structural.

---

## 2. Read-only edge function: `admin-disputes-queue`

`supabase/functions/admin-disputes-queue/index.ts` — admin-only, JWT-validated via `getClaims()`, service-role for read, no writes. Returns the exact payload requested:

```text
{ kpis, rows, filters, pagination }
```

KPI definitions:
- `open_disputes`: `disputes.status IN ('open','under_review','seller_response_pending','escalated')`
- `awaiting_seller`: `status = 'seller_response_pending'`
- `under_review`: `status = 'under_review'`
- `overdue`: active disputes where `seller_response_due_at < now()` OR `resolution_due_at < now()`
- `resolved_today`: `status = 'resolved' AND resolved_at >= today_start (Africa/Lagos)`
- `escalated`: `status = 'escalated' OR priority = 'critical'`
- `deltas.open_vs_yesterday` and `deltas.resolved_vs_target` derived from prior day + system_settings target

Rows joined from: `disputes`, `transactions`, `transaction_items`, `transaction_pricing`, `escrow_states`, `dispute_outcomes`, buyer/seller `profiles`, assigned-admin profile.

Query params: `quick` (overdue|open|awaiting_seller|under_review|escalated|resolved|all), `q`, `reason`, `agent`, `amount_bucket`, `date_from`, `date_to`, `priority`, `money_status`, `evidence_status`, `sla_state`, `page`, `page_size`, `sort`.

Hard guarantee: function only does `SELECT`. No RPC calls, no `update/insert/delete`, no Paystack, no resolve.

CSV export uses the same function with `format=csv` (or a tiny sibling) — respects all current filters.

---

## 3. Service layer

`src/services/admin-disputes.service.ts`:
- `getAdminDisputesQueue(params)` — calls `admin-disputes-queue` (GET via SDK invoke).
- `exportAdminDisputesQueue(params)` — fetches CSV blob with same params.

Re-exports the existing write actions from `src/services/admin-transaction-actions.service.ts` (resolve dispute, request more info, freeze/unfreeze, internal note, open investigation). **No new write endpoints are introduced.**

---

## 4. Page: `src/pages/AdminDisputes.tsx`

Wraps `AdminLayout`. Uses semantic tokens (`bg-background`, `bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`, sky-blue primary) — no hard-coded slate hex.

Sections:

**a. Header**
- Left: H1 "Dispute Resolution Queue" + subtitle "Live dispute triage and case management".
- Right (desktop): `Live sync` pulse (green when last fetch < 60s), `Export` button (CSV with current filters), `Open Investigation` (opens existing `InvestigationDrawer` in create mode — internal admin investigation only, never a buyer/seller dispute).
- Mobile header: hamburger sidebar toggle, SafeDeal admin logo, compact title, refresh icon, filters icon.

**b. KPI strip — 6 cards**
Open Disputes, Awaiting Seller Response, Under Review, Overdue Cases, Resolved Today, Escalated Cases. Each: icon tile, count, label, subline (delta / "X due today" / "Immediate attention" / "+N from target" / "Senior review"). Click applies the matching `quick` filter via URL.
Tones: open=info, awaiting=warning, under_review=muted, overdue=destructive, resolved=success, escalated=accent.
Component: `DisputeQueueKpiStrip.tsx`.

**c. Queue filters bar — `DisputeQueueFilters.tsx`**
Quick chips (counts from KPI payload): Overdue, Open, Awaiting Seller, Under Review, Escalated, Resolved, All. Active chip uses primary surface.
Advanced filters row (toggle): search input, dispute reason, assigned admin, amount range, date range, priority, money status, evidence status, SLA state. All synced via `useSearchParams`.

**d. Active Dispute Queue — `DisputeQueueTable.tsx` + `DisputeQueueRow.tsx`**

Desktop columns: Priority · Dispute · Parties · Amount · Status · SLA · Agent · Actions.

- **Priority**: dot + uppercase label (overdue=red, high=orange, medium=yellow, low=emerald, resolved=emerald). Left-edge accent strip via row `:before`.
- **Dispute**: `#DIS-...` (links `/admin/disputes/:id`), item title, `TXN-...` muted (links `/admin/transactions/:id`).
- **Parties**: stacked buyer + seller with avatar (initials fallback), verified seller badge, risk/flag badge if flagged.
- **Amount**: `formatMoney(amount, "NGN")` → `₦5,200,000.00` (2dp). NGN only on this admin screen — never `$`. Reason underneath: Item Condition / Not Delivered / Not as Described / Damaged / Wrong Item / Payment Issue / Other.
- **Status**: `<DisputeStatusBadge />` driven by `deriveDisputeDisplay` so resolved rows show Awaiting Release / Refund Pending / Partially Resolved / Manual Action Required and **never "In Dispute"**. Below: escrow line — Held in Escrow / Funds Frozen / Pending Release / Refund Pending / Released / Refunded / Completed.
- **SLA**: humanized ("2 days overdue", "Due in 4 hours", "Due in 1 day", "Resolved 2 days ago") + `Due: Jan 23, 16:00` (Africa/Lagos). Tone matches urgency.
- **Agent**: avatar + name, or `Unassigned` chip.
- **Actions**: primary `Review` (active) / `View Resolution` (resolved, success tone). Kebab via existing `RowActionsMenu`: Open detail, Resolve dispute, Request more info, Freeze funds, Unfreeze funds, Open investigation, Add internal note, Export data.

**e. Footer meta**: `Last updated: X ago` with `aria-live="polite"`, manual refresh icon. Auto-refresh every 30s while tab visible.

---

## 5. Row navigation

- Row click and `Review` → `/admin/transactions/:transactionId?tab=dispute&disputeId=:disputeId`
- `View Resolution` → `/admin/transactions/:transactionId?tab=resolution&disputeId=:disputeId`
- Kebab `Resolve dispute` → opens **the existing** `ResolveDisputeDialog` inline. The submit handler calls `resolveDispute()` from `admin-transaction-actions.service.ts` → `admin-transaction-actions` edge function → `resolve_dispute_atomic` RPC. **No duplicate logic.**

`AdminTransactionDetail.tsx` already reads `tab` and `disputeId` query params (or will, via a small one-line read of `useSearchParams`) to scroll/open the correct section. If those params aren't yet honored, add only the param-read + scroll-to behavior — no business logic change.

---

## 6. Money & dispute flow rules — preserved (no code changes here)

- Resolving a dispute does not call Paystack.
- `release_funds_to_seller` / `dismissed_seller_favor` → `funds_pending_release` (never `funds_releasing`).
- Central admin release workflow remains the only payout authority.
- `refund_buyer` / `dismissed_buyer_favor` → `refund_pending`.
- `partial_refund_release` → split refund + release rows.
- Investigation resolution does not auto-resolve disputes.
- Unfreezing funds does not auto-resolve disputes.
- Active dispute blocks release; resolved disputes never display as active.

---

## 7. Mobile

Under `lg`, the table collapses to stacked cards (`DisputeQueueRow` renders a card variant). Each card shows: dispute code, transaction code, item title, priority, status (derived), SLA, buyer, seller, amount (NGN), reason, assigned admin, primary `Review` / `View Resolution` button, kebab.
Mobile bottom nav: Dashboard · Transactions · **Disputes (active)** · More.

---

## 8. States

- Loading: skeleton KPI cards, skeleton filter row, skeleton table rows / cards.
- Empty: "No disputes match these filters."
- Error: "Unable to load dispute queue. Try again." + retry button.

---

## 9. CSV export columns

dispute_code, transaction_code, item_name, buyer_name, seller_name, amount, currency, dispute_reason, dispute_status, derived_display_status, money_status, priority, sla_state, due_at, assigned_admin, created_at, resolved_at — generated server-side respecting current filters.

---

## 10. Accessibility & motion

Keyboard reachable, visible focus rings via tokens, icons + labels (no color-only meaning), `prefers-reduced-motion` honored. Subtle motion only: KPI fade-in, chip transition, row hover, live-sync pulse, drawer fade, skeleton shimmer.

---

## 11. Tests — `src/components/admin/disputes/__tests__/DisputeQueueRow.test.tsx`

1. Resolved seller-favor → row badge shows "Awaiting Release".
2. Resolved buyer-favor → row badge shows "Refund Pending".
3. Resolved row never renders "In Dispute".
4. NGN amounts render with 2 decimals (e.g. `₦5,200.00`).
5. Quick filter chips render counts from KPI payload.
6. `Review` click navigates to `/admin/transactions/:id?tab=dispute&disputeId=:disputeId`.
7. Mobile card variant renders all required summary fields.

Existing `dispute-display-status.test.ts` already covers the derivation matrix and NGN formatting — not duplicated here.

---

## Files

**New**
- `src/pages/AdminDisputes.tsx`
- `src/services/admin-disputes.service.ts`
- `src/components/admin/disputes/DisputeQueueKpiStrip.tsx`
- `src/components/admin/disputes/DisputeQueueFilters.tsx`
- `src/components/admin/disputes/DisputeQueueTable.tsx`
- `src/components/admin/disputes/DisputeQueueRow.tsx`
- `src/components/admin/disputes/__tests__/DisputeQueueRow.test.tsx`
- `supabase/functions/admin-disputes-queue/index.ts`

**Edited (minimal, non-structural)**
- `src/App.tsx` — add `/admin/disputes` and `/admin/disputes/:id`
- `src/components/admin/useAdminNav.ts` — add `/admin/disputes` to `BUILT_ROUTES`
- `src/components/admin/AdminSidebar.tsx` — append Analytics + Reports to Overview, append Refunds to Financial. No group reordering, no removals, no renames.

**Reused as-is**
- `src/components/admin/transactions/ResolveDisputeDialog.tsx`
- `src/services/admin-transaction-actions.service.ts`
- `src/lib/dispute-display-status.ts`, `src/lib/status-labels.ts`, `src/lib/format.ts`
- `supabase/functions/admin-transaction-actions` (RPC + resolve flow)
- `supabase/functions/admin-transaction-detail` (Linked Records)

---

## Acceptance

`/admin/disputes` renders inside the Central Admin layout; sidebar Disputes link routes here; KPI cards reflect live data with the definitions above; quick + advanced filters work and are URL-synced; table matches the mockup; mobile uses stacked cards; amounts are NGN with 2dp; resolved rows use `deriveDisputeDisplay` and never show "In Dispute"; seller-favor → Awaiting Release; buyer-favor → Refund Pending; partial → split; row click + Review open the correct admin transaction detail with the dispute tab; Resolve Dispute reuses the existing central admin flow with no Paystack call; Export respects filters; loading/empty/error states present; admin-only access enforced; this remains a central admin operations screen.
