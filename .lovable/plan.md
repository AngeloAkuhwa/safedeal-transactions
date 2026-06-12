
# Admin Payout Management — Build Plan

Route: `/admin/payouts` (admin-only). This screen is SafeDeal's central operational finance hub where admins review payout eligibility, release seller payouts, retry failed ones, block/unblock, inspect, and audit. It is NOT a seller history page.

Visual source of truth: the two attached HTML mocks (desktop + mobile). Match design language, spacing, colors, cards, table, drawer, mobile cards, icons, typography, responsive behaviour. Reuse the existing admin sidebar — do not redesign it; only wire `/admin/payouts` so it stops showing "Coming soon".

---

## 0. Core product rule (non-negotiable)

- SafeDeal owns the escrow state machine via `transactions.money_status`, `escrow_states`, `escrow_ledger_entries`, `payouts`, `release_review_queue`.
- Paystack is only the payment rail (collect → hold in Paystack Balance via Manual Payouts → transfer to seller after admin Release → refund after admin approval).
- No Paystack split payments, no subaccount settlement, no automatic seller payout at checkout. Sellers are Paystack **transfer recipients**, not subaccounts.
- No payout row leaves this screen as "Completed" until the Paystack `transfer.success` webhook lands.
- Fee model (locked wording, used everywhere): `Item Total`, `Protection Fee`, `Payment Processing Fee`, `Total Charged`, `Seller Payout`, `Pending Release`, `Awaiting Release`, `Released to Seller`. Formula: `Total Charged = Item Total + Protection Fee + Payment Processing Fee`. `Seller Payout = Item Total` (uses the locked `transaction_pricing.seller_payout_amount` snapshot, never recomputed in UI). NGN only. No `$`, no Delivery/Shipping Fee, no merged "Protection & Processing Fee".

---

## 1. Routing & navigation

- `src/App.tsx`: add `<Route path="/admin/payouts" element={<AdminPayouts />} />` (lazy).
- `src/components/admin/useAdminNav.ts`: add `/admin/payouts` to `BUILT_ROUTES`.
- `src/components/admin/AdminSidebar.tsx`: entry already exists — verify it routes to `/admin/payouts` and uses `badges.payouts` (no redesign).
- Deep links:
  - `/admin/payouts?payout_id=<id>` auto-opens the drawer/detail panel after list load.
  - From `AdminTransactionDetail.tsx`: a "View Payout" link → `/admin/payouts?payout_id=<id>` when a payout exists.
  - From `AdminDisputeDetail.tsx` (after `release_funds_to_seller` / `partial_refund_release`): "View Payout" → same deep link.
- Drawer backlinks: Open Transaction → `/admin/transactions/:id`; Open Dispute → `/admin/disputes/:id` when linked; Open Investigation → existing admin investigation surface.

---

## 2. Which transactions reach this screen

A row appears only when a `payouts` row exists. Sources that create / re-arm one (existing logic, no changes needed):

1. Buyer confirms delivery (`seller-confirm-completion`/buyer verify) → `money_status = funds_pending_release`, payout `awaiting_release`.
2. Verification window expires with no dispute → `auto-timeout` / silent-dispute escalation queues the payout.
3. Admin confirms delivery on behalf of buyer.
4. Dispute resolved seller-favour (`resolve_dispute_atomic` outcomes `release_funds_to_seller`, `dismissed_seller_favor`, plus the release leg of `partial_refund_release`).
5. Failed payout retry path (`fail_payout_atomic` flips money back to `funds_pending_release` and payout → `failed`).
6. Reversal (`reverse_payout_atomic` after `transfer.reversed` webhook).

Escrow-only transactions (still `funds_held_in_escrow` with no resolution) do NOT appear here — Escrow tab handles those.

---

## 3. Payout eligibility matrix (Release CTA gate)

Frontend disables Release unless ALL pass; backend (`releasePayoutCore`) re-checks before any Paystack call.

| Gate | Required |
| --- | --- |
| `transactions.money_status` | `funds_pending_release` |
| `transactions.dispute_status` | `null` or `resolved` |
| `transactions.needs_admin_review` | `false` |
| Open investigation | none |
| `payouts.status` | `awaiting_release` |
| `payouts.release_blocked` | `false` |
| `payout_accounts.verification_status` | `verified` |
| `payout_accounts.provider_recipient_code` | non-empty |
| Open `release_review_queue` row | status `pending` or `claimed` |
| In-flight refund | none (`refunds` not in `pending`/`processing`) |
| Paystack merchant balance | ≥ payout amount (warn at row-level, block at batch-level) |
| Caller | has `admin` role |

Failure surfaces the exact failing gate in the drawer checklist and as a row tooltip. For unverified accounts, Core already auto-calls `flag_for_release_review('payout_account_missing')` → row appears in Blocked tab.

---

## 4. Tabs (defaults to Pending Release)

| Tab | Filter |
| --- | --- |
| All | every non-archived payout |
| Pending Release | `status='awaiting_release' AND release_blocked=false AND tx.money_status='funds_pending_release'` |
| Blocked | `release_blocked=true` OR queue `status='held'` OR payout account not verified |
| Processing | `status IN ('pending','processing') AND tx.money_status='funds_releasing'` |
| Completed | `status='completed' AND tx.money_status='funds_released'` |
| Failed | `status='failed'` |
| Reversed | `status='reversed'` |
| Disputed / On Hold | tx has `needs_release_review=true` OR open queue row of type `manual_hold` / `silent_dispute` / `dispute_resolved_partial` |

Each tab carries a badge count from the summary endpoint. Pending Release sorted by `entered_queue_at` ascending (oldest first).

---

## 5. KPI summary cards (6 cards, NGN, real data)

Pulled from `admin-payouts-summary`:

1. **Pending Release** — count + sum, orange clock icon.
2. **Processing** — count + sum, blue rotating-arrows icon.
3. **Failed** — count + retry-eligible sum, red triangle icon.
4. **Released Today** — sum where `released_at::date = today` and status in `processing`/`completed`, green check icon.
5. **Released This Week** — same, 7-day window, purple calendar icon.
6. **Avg Release Lead Time** — `avg(released_at - entered_queue_at)` over last 30d completions, cyan stopwatch icon.

Compact **Paystack Balance** pill in the header strip (not a KPI card). Source: backend proxy to Paystack `GET /balance`. If unavailable, show "Balance unavailable" without blocking the page. Warn (amber) when balance < selected pending total.

---

## 6. Filters & search

Filter row (matches mock): Status · Date Range · Amount Range · Bank Verification · Quick Filters · Search input · Filter icon (opens panel on mobile).

Search placeholder: `Search seller, transaction, payout ID...`. Matches: seller name, seller email, transaction code, payout ID, provider transfer reference, last-4 of bank account. No page-level horizontal scroll on any breakpoint.

---

## 7. Table (desktop)

Wrapper: dark slate card; header shows "Payout Records", count, Refresh button. Columns:

1. Checkbox (disabled with tooltip when row is not release-eligible)
2. Payout — payout ID, queue/failure/block reason, status icon
3. Seller — avatar, name, masked account / seller tier
4. Transaction — code, item snippet
5. Amount — `seller_payout_amount` in NGN
6. Payout Account — bank, masked account, verification pill
7. Status — status pill
8. Aged / Initiated — `entered_queue_at` + relative age
9. Actions — primary CTA + kebab

Primary CTA per state: Pending eligible → **Release**; Pending ineligible → disabled **Release**; Failed retryable → **Retry**; Processing → **View**; Completed → **View**; Reversed → **Investigate**; Blocked → **Unblock** or **View**; Disputed/On Hold → **View Hold**.

Kebab: View Details · Open Transaction · Open Dispute (when linked) · Add Internal Note · Block Payout · Unblock (when blocked) · Retry (when failed retryable) · Download Receipt (when completed).

Status pill palette: Pending Release (amber) · Processing (blue) · Completed/Released (emerald) · Failed (red) · Blocked (red/destructive) · Reversed (purple) · Disputed/On Hold (amber) · Awaiting Verification (slate/blue).

---

## 8. Batch bar

Appears when ≥1 row selected. Shows selected count, selected total. Buttons: Process Selected · Retry Selected · Export Selected · Clear. Only release-eligible rows count toward "Process Selected"; ineligible selections disabled with tooltip.

Batch release: call `release-payout` per row, concurrency 3, progress dialog, do not abort on per-row failure. Final summary: ok count, failed count + reasons. Idempotency already enforced by `releasePayoutCore` via `provider_reference` short-circuit.

---

## 9. Detail drawer (desktop) / full-screen panel (mobile)

Sections, in order:

1. **Header summary**: payout ID, status pill, amount (NGN), seller name, transaction code.
2. **Eligibility checklist** (§3): each gate listed with pass/fail icon; if any fails, Release disabled and the failing gate is named.
3. **Pricing breakdown** (locked wording):
   - Item Total
   - Protection Fee
   - Payment Processing Fee
   - Total Charged
   - **Seller Payout** = `pricing.seller_payout_amount` (snapshot, never recomputed)
4. **Seller payout account**: bank, masked account, account name, verification status, recipient code present/missing, last verified.
5. **Linked records**: Open Transaction · Open Dispute · Open Investigation · View Payment · View Escrow.
6. **Timeline**: reuse `AdminCaseTimeline` with `payout` filter — queued · block/unblock · release initiated · transfer success/failed/reversed · retry attempts · refund conflicts · linked dispute outcomes.
7. **Notes**: existing internal notes list + Add Note action.
8. **Action buttons**: Release · Retry · Block · Unblock · Refund Buyer (only when no payout in flight and tx still refundable) · Open Transaction. Availability driven by backend `eligibility` payload, not UI status guesses.

---

## 10. Action flows

### Release
Confirmation modal showing seller name, bank/account, payout amount, transaction code, payout reason, warning that this initiates a real Paystack transfer. Double-click guard. Calls `POST /functions/v1/release-payout` `{ transaction_id, payout_id, notes }`. On success → row → Processing, drawer status updates, toast "Payout release initiated". Never marks completed locally; that comes from the webhook.

### Retry
Calls `POST /functions/v1/retry-payout` `{ payout_id, notes? }`. Only enabled when `status='failed' AND retry_allowed=true` and all other gates pass. Failure history stays visible in timeline; new attempt has its own row in the timeline.

### Block / Unblock
New action types added to `admin-transaction-actions`:
- `block_payout`: require reason (min length enforced), set `payouts.release_blocked=true`, `payout_blocked_reason`, write `admin_actions` + `transaction_events`. Row moves to Blocked tab.
- `unblock_payout`: require reason, clear `release_blocked`, write audit rows, re-evaluate eligibility; if all gates pass, row returns to Pending Release.

### Refund Buyer
Drawer-only. Enabled only when no payout in flight and not completed. Uses existing `refund-transaction`. No new refund logic.

---

## 11. Mobile layout

Use the mobile mock as the spec.

- Hide desktop sidebar; sticky top header with hamburger, SafeDeal mark, notification icon, admin avatar.
- Title `Payout Management`, subtitle `Monitor and manage seller payouts`.
- KPI cards: 2-column grid.
- Full-width search; horizontal-scroll tabs; filter icon button opens a collapsible filter panel.
- Replace table with **payout cards**: checkbox, status icon, payout ID, reason summary, status pill, seller avatar/name, seller tier or masked account, amount, transaction code + item snippet, bank/account verification chip, queued/initiated time, primary action, secondary View, kebab.
- Batch bar appears above the list when cards are selected.
- Detail drawer becomes a **full-screen panel** with sticky top bar (back arrow, payout ID, status pill), stacked sections, full-width action buttons.
- All tap targets meet mobile size.

## 12. Tablet layout

- Keep sidebar behaviour the app already uses at tablet width (collapse if existing pattern collapses).
- KPI grid: 3 cols or 2 cols depending on width.
- Filters wrap; no text clipping.
- Table can degrade to a compact card list if needed — no page-level horizontal scroll.
- Drawer narrows or becomes an overlay panel. No squeezed columns.

## 13. Loading / empty / error states

- Skeletons: KPI cards, table rows, mobile cards, drawer.
- Empty states: no pending / no failed / no completed / no filter matches (each with helpful copy and primary action when relevant).
- Errors: summary load, list load, detail load, release action, retry action, block/unblock action, Paystack balance unavailable. Every error includes a Retry control.

---

## 14. Edge functions

### New
- `admin-payouts-summary` — KPI counts/sums + Paystack balance proxy (best-effort, swallows errors).
- `admin-payouts-list` — paginated/filterable query joining `payouts` + `transactions` + `transaction_pricing` + `payout_accounts` + `release_review_queue`. Returns `seller_payout_amount` from the pricing snapshot.
- `admin-payouts-detail` — single payout drawer payload: payout + tx + pricing snapshot + payout account + eligibility checklist (computed server-side, mirrors §3) + timeline + queue rows + notes.

### Reused as-is
`release-payout`, `retry-payout`, `refund-transaction`, `paystack-webhook`, `flag-for-release-review`, `resolve-release-review`.

### Additive (no schema change)
`admin-transaction-actions` gains:
- `block_payout` — toggles `payouts.release_blocked=true` + sets `payout_blocked_reason`; writes `admin_actions` + `transaction_events`.
- `unblock_payout` — clears the flag; writes audit rows.

All edge functions follow the project CORS rules (`Access-Control-Allow-Methods` per method). Services own all `fetch`; components never touch the Supabase client directly. PATCH/DELETE use direct `fetch` per existing convention.

---

## 15. Frontend files

- `src/pages/AdminPayouts.tsx` — page shell, URL `?payout_id`/`?tab`/`?status` sync, data loaders.
- `src/components/admin/payouts/PayoutSummaryCards.tsx`
- `src/components/admin/payouts/PayoutTabs.tsx`
- `src/components/admin/payouts/PayoutFilters.tsx`
- `src/components/admin/payouts/PayoutBatchBar.tsx`
- `src/components/admin/payouts/PayoutsTable.tsx`
- `src/components/admin/payouts/PayoutMobileCards.tsx`
- `src/components/admin/payouts/PayoutDetailDrawer.tsx`
- `src/components/admin/payouts/PayoutEligibilityChecklist.tsx`
- `src/services/admin-payouts.service.ts` — `getSummary`, `listPayouts`, `getPayoutDetail`, `releasePayout`, `retryPayout`, `blockPayout`, `unblockPayout`, `refundBuyer`, `addInternalNote`.

Design tokens: existing Tailwind theme. No new colour tokens needed; status pills reuse the locked palette.

---

## 16. Paystack model summary (what code assumes)

- SafeDeal account has **Manual Payouts ON**, **Transfers ON**, **Webhooks configured**. (Operational setting; documented in plan, no code switch.)
- Buyer pays `Total Charged` to SafeDeal's Paystack account → stays in Paystack Balance.
- Admin Release calls `POST /transfer` with `source: balance`, `amount = seller_payout_amount`, `recipient = recipient_code`, `reference = SAFEDEAL-PAYOUT-{transactionId}-{payoutId}` (idempotent; retries use `_r{attempt}` suffix per existing `retry-payout`).
- Refund uses `POST /refund` against the original payment reference.
- Money is marked released only after `transfer.success` webhook; failed → `failed` tab; reversed → `reversed` tab and `funds_frozen`.

---

## 17. Out of scope (this pass)

- No schema migration. No fee calculator change. No edits to `release-payout` / `retry-payout` / `paystack-webhook` core logic. No partial-amount admin release UI (existing dispute partial release amounts honoured). No CSV export pipeline (button stubs to existing export endpoint when wired later). No multi-currency (NGN only). No payout scheduler/cron — release stays admin-initiated.

---

## 18. Acceptance

1. `/admin/payouts` loads inside existing admin layout, sidebar entry no longer shows "Coming soon".
2. Desktop visually matches the desktop mock; mobile matches the mobile mock; tablet has no overflow or broken layout.
3. 6 KPI cards populate from `admin-payouts-summary`; Paystack balance pill present (degrades gracefully).
4. 8 tabs filter correctly with badge counts; Pending Release is default; rows sorted oldest first.
5. Filters + search combine correctly; no page-level horizontal scroll on any breakpoint.
6. Clicking a row opens the drawer (desktop) or full-screen panel (mobile); `?payout_id=` deep link auto-opens.
7. Drawer shows eligibility checklist, locked-wording pricing breakdown, payout account, linked records, timeline, notes, actions.
8. Release CTA disabled unless every eligibility gate passes; backend re-validates before any Paystack call.
9. Release calls `release-payout`, row moves to Processing, money becomes `funds_releasing`, no premature "Completed".
10. Retry calls `retry-payout`; failure history preserved in timeline.
11. Block/Unblock toggle `release_blocked` via new `admin-transaction-actions` actions and write audit rows.
12. Batch release processes selected eligible rows with concurrency 3, progress dialog, per-row failure tolerance, idempotent.
13. Refund Buyer disabled when payout in flight; uses existing refund endpoint.
14. All money labels use the locked SafeDeal wording in NGN; no `$`, no Delivery Fee anywhere on the screen.
15. No schema migration is introduced.
