# Central Admin Dispute Resolution Queue — Final Plan

Build `/admin/disputes` as a Central Admin operations screen matching the uploaded mockup, fully wired to the existing central resolve flow (`admin-transaction-actions` → `resolve_dispute_atomic` RPC, `ResolveDisputeDialog`, `deriveDisputeDisplay`, Linked Records). Read-only aggregator only — no new write paths, no Paystack, no money movement.

---

## 1. Routing & navigation

**`src/App.tsx`** (inside the existing `requireRole="admin"` block)
- `/admin/disputes` → `AdminDisputes` page
- `/admin/disputes/:id` → `AdminDisputeRedirect` resolver: fetches `disputes.transaction_id` then `navigate("/admin/transactions/" + tx + "?tab=dispute&disputeId=" + id, { replace: true })`. Preserves dashboard Recent Activity links.

**`src/components/admin/useAdminNav.ts`** — add `/admin/disputes` to `BUILT_ROUTES` so the sidebar Disputes item routes here and drops the "Coming soon" tooltip. Active disputes badge already wired (`badges.disputes`, orange tone).

**`src/components/admin/AdminSidebar.tsx` — add ONLY missing items, no restructure**
- Overview group: append **Analytics** (`/admin/analytics`, `BarChart3`) and **Reports** (`/admin/reports`, `FileBarChart`) after Dashboard.
- Financial group: append **Refunds** (`/admin/refunds`, `Undo2`) after Money Tracing.
- Existing groups (Operations, Risk & Compliance, Support & Tools, Settings) stay exactly as they are. Fraud Detection stays under Risk & Compliance (not duplicated). Money Tracing is not renamed to "Funds Tracking".
- The 3 new entries stay out of `BUILT_ROUTES`, so they keep the existing "Coming soon" tooltip — matches current behavior for unbuilt items.

---

## 2. Read-only edge function — `supabase/functions/admin-disputes-queue/index.ts`

Admin-only, JWT-validated via `getClaims()`, service-role for read, **no writes**, no RPC, no Paystack. Returns `{ kpis, rows, filters, pagination }`.

**KPI definitions**
- `open_disputes`: `status IN ('open','under_review','seller_response_pending','escalated')`
- `awaiting_seller`: `status = 'seller_response_pending'`
- `under_review`: `status = 'under_review'`
- `overdue`: active disputes where `seller_response_due_at < now() OR resolution_due_at < now()`
- `resolved_today`: `status = 'resolved' AND resolved_at >= today_start (Africa/Lagos)`
- `escalated`: `status = 'escalated' OR priority = 'critical'`
- `deltas.open_vs_yesterday`, `deltas.resolved_vs_target` derived from prior day + system_settings target

Rows joined from `disputes`, `transactions`, `transaction_items`, `transaction_pricing`, `escrow_states`, `dispute_outcomes`, buyer/seller `profiles`, assigned-admin profile.

**Query params**: `quick` (overdue|open|awaiting_seller|under_review|escalated|resolved|all), `q`, `reason`, `agent`, `amount_bucket`, `date_from`, `date_to`, `priority`, `money_status`, `evidence_status`, `sla_state`, `page`, `page_size`, `sort`, `format=csv` for export.

---

## 3. Service layer — `src/services/admin-disputes.service.ts`

- `getAdminDisputesQueue(params)` — GET to `admin-disputes-queue` via authed fetch.
- `exportAdminDisputesQueue(params)` — same fn, `format=csv`, returns Blob.
- Re-exports write actions from `admin-transaction-actions.service.ts`: `resolveDispute`, `disputeRequestMoreInfo`, `freezeTransaction`, `unfreezeTransaction`, `addInternalNote`, `flagForReview`, `escalateDispute`. **No new write endpoints.**

---

## 4. Page — `src/pages/AdminDisputes.tsx`

Wraps `AdminLayout`. Semantic tokens only (`bg-background`, `bg-card`, `border-border`, sky-blue primary).

**Header**
- Left: H1 "Dispute Resolution Queue" + subtitle "Live dispute triage and case management".
- Right (desktop): Live sync pulse (green when last fetch < 60s), Export (CSV with current filters), Open Investigation (opens existing `InvestigationDrawer` in create mode — internal admin investigation only).
- Mobile: hamburger, SafeDeal admin logo, compact title, refresh, filters icon.

**KPI strip — `DisputeQueueKpiStrip.tsx`** — 6 cards (Open / Awaiting Seller / Under Review / Overdue / Resolved Today / Escalated). Each: icon tile, count, label, subline (delta / due today / immediate attention / +N from target / senior review). Click applies matching `quick` filter via URL. Tones: info / warning / muted / destructive / success / accent.

**Filters bar — `DisputeQueueFilters.tsx`**
- Quick chips (counts from KPI payload): Overdue, Open, Awaiting Seller, Under Review, Escalated, Resolved, All. Active chip uses primary surface.
- Advanced filters (toggle): search, dispute reason, assigned admin, amount range, date range, priority, money status, evidence status, SLA state. All URL-synced via `useSearchParams`.

**Active Dispute Queue — `DisputeQueueTable.tsx` + `DisputeQueueRow.tsx`**

Desktop columns: Priority · Dispute · Parties · Amount · Status · SLA · Agent · Actions.

- **Priority**: dot + uppercase label (overdue=red, high=orange, medium=yellow, low=emerald, resolved=emerald); left-edge accent strip via `:before`.
- **Dispute**: `#DIS-...` (→ `/admin/disputes/:id`), item title, `TXN-...` muted (→ `/admin/transactions/:id`).
- **Parties**: stacked buyer + seller with avatar (initials fallback), verified seller badge, risk/flag badge.
- **Amount**: `formatMoney(amount, "NGN")` → `₦5,200,000.00` (2dp, NGN only — never `$`). Reason underneath (Item Condition / Not Delivered / Not as Described / Damaged / Wrong Item / Payment Issue / Other).
- **Status**: `<DisputeStatusBadge />` driven by `deriveDisputeDisplay` → seller-favor=Awaiting Release, buyer-favor=Refund Pending, partial=Partially Resolved, close-no-action+frozen=Manual Action Required. Resolved rows **never** show "In Dispute". Below: escrow line (Held in Escrow / Funds Frozen / Pending Release / Refund Pending / Released / Refunded / Completed).
- **SLA**: humanized ("2 days overdue", "Due in 4 hours", "Resolved 2 days ago") + `Due: Jan 23, 16:00` (Africa/Lagos). Tone matches urgency.
- **Agent**: avatar + name, or `Unassigned` chip.
- **Actions**: primary `Review` (active) / `View Resolution` (resolved, success tone). Kebab via existing `RowActionsMenu`: Open detail, Resolve dispute, Request more info, Freeze/Unfreeze, Open investigation, Add note, Export.

**Footer meta**: `Last updated: X ago` with `aria-live="polite"`, manual refresh icon. Auto-refresh every 30s while tab visible.

---

## 5. Row navigation

- Row click + `Review` → `/admin/transactions/:transactionId?tab=dispute&disputeId=:disputeId`
- `View Resolution` → `/admin/transactions/:transactionId?tab=resolution&disputeId=:disputeId`
- Kebab `Resolve dispute` → opens **the existing** `ResolveDisputeDialog` inline. Submit calls `resolveDispute()` from `admin-transaction-actions.service.ts` → `admin-transaction-actions` edge function → `resolve_dispute_atomic` RPC. No duplicate logic.

`AdminTransactionDetail.tsx` reads `tab` and `disputeId` query params to scroll/open the correct section (small one-line param read only — no business logic change).

---

## 6. Money & dispute rules — preserved (no code changes)

- Resolve does not call Paystack.
- `release_funds_to_seller` / `dismissed_seller_favor` → `funds_pending_release` (never `funds_releasing`).
- Central admin release workflow remains the only payout authority.
- `refund_buyer` / `dismissed_buyer_favor` → `refund_pending`.
- `partial_refund_release` → split refund + release rows.
- Investigation resolution does not auto-resolve disputes.
- Unfreezing funds does not auto-resolve disputes.
- Active dispute blocks release; resolved disputes never display as active.

---

## 7. Mobile

Under `lg`, table collapses to stacked cards (`DisputeQueueRow` card variant). Each card: dispute code, transaction code, item title, priority, derived status, SLA, buyer, seller, NGN amount, reason, assigned admin, primary `Review`/`View Resolution`, kebab. Mobile bottom nav: Dashboard · Transactions · **Disputes (active)** · More.

---

## 8. States

- Loading: skeleton KPI cards + filters + rows/cards.
- Empty: "No disputes match these filters."
- Error: "Unable to load dispute queue. Try again." + retry.

---

## 9. CSV export

Server-side, respects current filters. Columns: dispute_code, transaction_code, item_name, buyer_name, seller_name, amount, currency, dispute_reason, dispute_status, derived_display_status, money_status, priority, sla_state, due_at, assigned_admin, created_at, resolved_at.

---

## 10. Accessibility & motion

Keyboard reachable, visible focus rings via tokens, icons + labels (no color-only meaning), `prefers-reduced-motion` honored. Subtle motion only: KPI fade-in, chip transition, row hover, live-sync pulse, drawer fade, skeleton shimmer.

---

## 11. Tests — `src/components/admin/disputes/__tests__/`

1. Resolved seller-favor → "Awaiting Release".
2. Resolved buyer-favor → "Refund Pending".
3. Resolved row never renders "In Dispute".
4. NGN amounts render with 2dp (`₦5,200.00`, `₦5,200,000.00`).
5. Quick filter chips render counts from KPI payload.
6. `Review` click navigates to `/admin/transactions/:id?tab=dispute&disputeId=:disputeId`.
7. Mobile card variant renders all required summary fields.

Existing `dispute-display-status.test.ts` covers the derivation matrix — not duplicated.

---

## Files

**New**
- `src/pages/AdminDisputes.tsx`
- `src/pages/AdminDisputeRedirect.tsx`
- `src/services/admin-disputes.service.ts`
- `src/components/admin/disputes/DisputeQueueKpiStrip.tsx`
- `src/components/admin/disputes/DisputeQueueFilters.tsx`
- `src/components/admin/disputes/DisputeQueueTable.tsx`
- `src/components/admin/disputes/DisputeQueueRow.tsx`
- `src/components/admin/disputes/__tests__/DisputeQueueRow.test.tsx`
- `src/components/admin/disputes/__tests__/DisputeQueueDisplay.test.ts`
- `supabase/functions/admin-disputes-queue/index.ts`

**Edited (minimal, non-structural)**
- `src/App.tsx` — register `/admin/disputes` and `/admin/disputes/:id`.
- `src/components/admin/useAdminNav.ts` — add `/admin/disputes` to `BUILT_ROUTES`.
- `src/components/admin/AdminSidebar.tsx` — append Analytics + Reports to Overview, append Refunds to Financial. No group reordering, no removals, no renames.

**Reused as-is**
- `src/components/admin/transactions/ResolveDisputeDialog.tsx`
- `src/services/admin-transaction-actions.service.ts`
- `src/lib/dispute-display-status.ts`, `src/lib/status-labels.ts`, `src/lib/format.ts`
- `supabase/functions/admin-transaction-actions` (RPC + resolve flow)
- `supabase/functions/admin-transaction-detail` (Linked Records)

---

## Acceptance

`/admin/disputes` renders in Central Admin layout; sidebar Disputes routes here with active badge; KPI cards reflect live data with definitions above; quick + advanced filters work and are URL-synced; table matches the mockup; mobile uses stacked cards; amounts NGN 2dp; resolved rows use `deriveDisputeDisplay` and never show "In Dispute"; seller-favor → Awaiting Release; buyer-favor → Refund Pending; partial → split; row click + Review open the correct admin transaction detail with the dispute tab; Resolve Dispute reuses the existing central admin flow with no Paystack call; Export respects filters; loading/empty/error states present; admin-only access enforced; sidebar groups unchanged except for the 3 appended items.
