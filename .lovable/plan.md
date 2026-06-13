
## Goal

Bring `/admin/payouts` to match the full functional spec, with the corrected defaults: **All everywhere**, drawer perfectly aligned with the row it was opened from, and CTA states that visually match their real eligibility. UI design is locked.

## What the current build already covers (no work needed)

- Read-only page load; summary, list, and drawer fetched independently.
- KPI cards with 60s polling, skeletons, and tab counts wired to `admin-payouts-summary`.
- Tab / filter / search / `payout_id` query-param sync, deep-link drawer open & close that removes only `payout_id`.
- `eligibleForRelease` row gating, per-row Release/Retry/Unblock/View primary actions, status-aware kebab menus, blocked-disabled Release with tooltip reason.
- Batch release with concurrency = 3, summary toast, refresh.
- Drawer sections: hero, seller, eligibility checklist, pricing breakdown, account, transaction, payout history, linked records, timeline (uses `AdminCaseTimeline`), release/retry/block/unblock action buttons with reason capture.
- CSV export of current filtered rows + per-row Download Receipt.
- Mobile cards path; navigation to `/admin/users/:id`, `/admin/transactions/:id`, `/admin/disputes/:id`.

## Corrected defaults (replaces the prior "Pending Release / Last 7 days" default)

Opening `/admin/payouts` with NO query params hydrates to the broadest view:

- Active tab: **All**
- Status dropdown: **All Statuses**
- Date Range: **All time**
- Amount Range: **Any Amount**
- Bank Verification: **All Accounts**
- Quick Filters: **None**
- Search: empty

Initial URL becomes `/admin/payouts?tab=all&range=all_time`. Already-stored URL params win over defaults. When the drawer closes only `payout_id` is removed; tab, range, and every other filter/search param are preserved.

The Status dropdown must not silently override the active tab on page load — when Status is "All Statuses", the active tab stays on whatever the URL says (defaulting to All).

## What to add / change

### 1. URL & default hydration

- Change initial state in `AdminPayouts.tsx` so when no `tab` param is present, default to `all`; when no `range`, default to `all_time`. (Already matches today — keep and lock it in.)
- Hydrate `search` from `searchParams.get("search")` and write it back (debounced ~300ms). Today it lives only in component state.
- On tab change: reset page to 1, clear selection, do NOT clear search/filters.
- Custom date range: only fire the list fetch once both `from` and `to` are set.

### 2. Tabs & filters

- Add Bank Verification options the spec calls out: `Missing Recipient Code`, `No verified payout account`.
  - Server (`admin-payouts-list`): extend `bank_status` to include `missing_recipient` (account verified AND `provider_recipient_code IS NULL`) and `no_account` (no `payout_accounts` row OR not verified).
- Add Quick Filters: `Oldest First`, `Needs Review`, `Insufficient Balance Risk`.
  - `oldest_first` → explicit `created_at asc`.
  - `needs_review` → `transactions.needs_release_review = true`.
  - `insufficient_balance_risk` → client-side flag once cumulative `amount` exceeds `summary.paystack_balance.available`.
- Tighten tab semantics in `admin-payouts-list`:
  - `pending_release`: `status = awaiting_release AND release_blocked = false AND money_status = 'funds_pending_release'`.
  - `processing`: also require `money_status = 'funds_releasing'`.
  - `completed`: also require `money_status = 'funds_released'`.
  - `blocked`: `release_blocked = true OR status = 'blocked' OR release_review_queue.held OR account not verified`.
  - `on_hold` (Disputed/On Hold): move from client-side filter to server (dispute_active / manual_hold / silent_dispute / release_review_hold / partial_dispute_hold).

### 3. Sort per tab (server-side)

- Pending Release → oldest queued first.
- All → newest activity first (`greatest(updated_at, released_at, initiated_at) desc`).
- Failed → most recent failure first.
- Processing → most recent first.
- Completed → newest released first.

### 4. Row selection & batch

- Keep "select all eligible" only.
- Add a "Retry Selected" batch when active tab = `failed`; same concurrency-3 worker; calls `retry-payout`.
- Replace the current `window.confirm` with a real Process-Batch confirmation modal:
  - Shows selected count, total amount, Paystack available balance, warning copy "This will initiate real seller payout transfers."
  - Cancel / Process Selected; Confirm disabled while in flight.
- Progress dialog during run: total / done / success / fail / current; do not abort on failure. Show summary with reasons afterwards.
- Inline warning in batch bar when `Σ selected.amount > paystack_balance.available`: "Selected payouts exceed available Paystack balance." Warning only — backend remains the gate.

### 5. Single-row Release & Retry confirmation modals

- Replace immediate fire with a confirmation modal.
- Release modal shows: seller name, payout amount, bank/masked account, transaction code, warning "This starts a real provider transfer." Cancel / Confirm Release.
- Retry modal shows: failure reason, payout amount, seller account, Cancel / Confirm Retry.
- Same modals used from both the row and the drawer.

### 6. Drawer alignment with the row that opened it

The drawer must visually reconcile with the row.

- **Hero status pill** uses friendly labels — never raw enum text:
  - `released` / `paid` → **Released**
  - `processing` / `initiated` / `pending` (provider) → **Processing**
  - `failed` → **Failed**
  - `awaiting_release` / `queued` → **Pending Release**
  - `release_blocked = true` → **Blocked**
  - `reversed` → **Reversed**
- **Hero caption** (single source of truth for the row + drawer subtitle):
  - If `payout_blocked_reason` → show it.
  - Else if `failure_reason` → show it (e.g. "Bank account blocked by provider").
  - Else if `status = completed` → "Completed successfully".
  - Else if `status in (pending, processing)` → "Bank processing".
  - Pull this from a shared helper (`getPayoutCaption(row)`) used by `PayoutsTable` and `PayoutDetailDrawer`.
- Optimistic update: when the drawer opens, prime hero from the row data, then replace with the freshly fetched `admin-payouts-detail` payload so the badge never flickers to a stale "Pending".

### 7. Eligibility checklist — bug fixes & status awareness

- Fix the "No active dispute" gate: `pass = (!dispute || dispute.status === 'resolved')`. When passing, label = `PASS` (green). Today it can render `ACTION NEEDED` with the description "No open dispute" — that's the bug. Apply the same audit to every gate: green pass icon when `pass = true`, red action-needed only when `pass = false`. The label and icon must derive from the same `pass` boolean.
- For terminal-state payouts the checklist must still evaluate correctly per the current row:
  - Failed payout: `Payout awaiting release` fails (status is failed); `Funds pending release` fails if money status no longer equals `funds_pending_release`; `No active dispute` / `No investigation` / `Not blocked` / `Account verified` / `Recipient code` / `No in-flight refund` evaluate independently and only fail when actually failing.
  - Released/processing payout: gates are informational — checklist may still show passes where applicable; Release CTA remains disabled regardless.

### 8. Release & Retry CTA visual states in the drawer

- Release Payout: derive `enabled = eligibility.eligible && payout.status === 'awaiting_release' && !release_blocked`. When not enabled, render the disabled style (muted slate/green, low opacity, `cursor-not-allowed`, no hover) — not the bright emerald active CTA. Add helper text underneath the action group when disabled: "Release is disabled — resolve the failing gate above before retrying."
- Retry Payout: enabled only when backend `payout.retry_allowed = true` AND `status = failed`. When disabled, show the blocker pulled from backend (e.g. "Bank account must be updated or re-verified before retry."). Add a `retry_blocker_reason` field to the `admin-payouts-detail` response so the frontend stops guessing.
- Block Payout: visible for `pending_release` and `failed`; hidden for `processing`/`completed` unless backend allows it.
- Unblock Payout: replaces Block when `release_blocked = true`.

### 9. Pricing breakdown — no fake zeros

- `admin-payouts-detail` already returns numeric pricing. Update the response so missing pricing values are returned as `null` (not coerced to 0). In the drawer, render `formatMoney(value)` only when `value !== null`, otherwise show `—`.
- Always render `Seller Payout` from the backend `payout.amount` (it exists even when pricing snapshot is missing) so the hero amount and the breakdown agree.
- Never recompute the seller payout on the client.

### 10. Seller payout account — table vs drawer parity

Use the four canonical states everywhere (`getAccountState(row)`):

- `no_account` → Table: "No payout account" · Drawer: "No payout account on file".
- `unverified` → Table: "Payout account unverified" · Drawer: `Verification: unverified`.
- `verified_no_recipient` → Table: "Recipient code missing" · Drawer: `Verification: verified`, `Recipient code: missing`.
- `verified_ready` → Table: bank name · ****1234 · VERIFIED · Drawer: `Verification: verified`, `Recipient code: present`.

This removes the contradiction where the table says "No verified payout account" while the drawer shows a verified Citibank account with a missing recipient code.

### 11. Drawer action set per status

- **Released** → Open Transaction · Download Receipt (if available) · Add Internal Note. Hide Release / Retry.
- **Processing** → Open Transaction · View Processing Status · Add Internal Note. Release/Retry hidden (or shown disabled).
- **Failed** → Retry Payout (if `retry_allowed`) · Block Payout · Open Transaction · Add Internal Note. Release disabled or hidden.
- **Pending Release** → Release Payout (only if all gates pass) · Block Payout · Open Transaction · Add Internal Note.
- **Blocked** → Unblock Payout · Open Transaction · Add Internal Note. Release hidden until unblock + revalidation.

### 12. Refund Buyer (drawer only)

- Backend (`admin-payouts-detail`): add `refund: { allowed, amount, blocker }`.
- Show "Refund Buyer" when `refund.allowed`; disabled when `status in ('processing','completed')` or `refund_in_flight` or no permission.
- Click → confirm modal → POST existing `refund-transaction`.
- On success: refresh detail + list + summary; Release becomes disabled while refund is in flight.

### 13. Drawer loading / error / polling

- Add `detailError` state. When fetch fails, render an inline error block with Retry inside the drawer (don't just toast).
- When backend returns 404: "Payout not found or no longer available." with a Close button.
- While drawer is open AND payout status is `pending`/`processing`, refetch detail every 15s; stop on close or terminal state.

### 14. Post-action and post-webhook refresh

- After Release/Retry/Block/Unblock/Refund: refetch list + summary (already done). Additionally schedule list refetches at 5s / 15s / 30s after Release so Paystack webhook results surface without manual refresh.
- Tab-aware polling: every 60s refetch the list only when active tab is `processing` or `pending_release`.

### 15. Kebab vs drawer interaction

- Eye icon, View, Details, and row click all open the drawer; never trigger another action and never select the row checkbox.
- Clicking the kebab opens menu only — never the drawer.
- Menu items:
  - "View Details" → opens drawer.
  - "Open Transaction" → navigates.
  - "Retry Payout" → retry confirmation modal.
  - "Block Payout" → block reason modal.
  - "Open Dispute" → added whenever `row.transaction.dispute_status` is set.
  - "Release Payout" → added to the eligible-pending kebab default branch (currently missing).

### 16. Loading / empty / error states

- Summary error: inline retry block in the KPI section (not toast-only).
- List error: full empty card "Unable to load payouts" + Retry button.
- Empty subtext per active tab (spec strings); search-empty uses "No payouts match your search."
- On refetch with existing rows: subtle overlay, not full-page skeleton.

### 17. Security guardrails (verification, no new code needed)

- Every action endpoint runs `requireAdmin` server-side.
- Frontend never marks a payout completed after Release — only webhook does.
- Pricing values come from backend; frontend never recalculates seller payout.

## Things to drop or defer

1. **"Disputed / On Hold" as a 7th visible tab.** Tab strip stays at All / Pending / Processing / Failed / Completed / Blocked. Surface "On Hold" via the Quick Filter `needs_review`; the drawer eligibility checklist explains the hold reason.
2. **"Open Investigation" link.** No `/admin/investigations/:id` route yet — show investigation summary inline in the drawer instead of a dead link.
3. **"View payment record" / "View escrow record" buttons.** Same reason — inline summary, no dead routes.
4. **Admin-side bank account editor.** Sellers own that record. "Update Bank Account" stays as a navigation to the seller profile.
5. **Hard-blocking batch on insufficient balance.** Warning only — backend enforces.
6. **Realtime subscription on payouts.** Skip for now; targeted refetches plus tab-conditional polling are enough.
7. **Custom Amount Range UI.** Defer — four preset bands cover real ops needs.

## Things to do better than the spec

1. **One `<PayoutConfirmDialog>`** with a variant prop for Release / Retry / Refund / Block / Unblock. Keeps copy and behavior consistent.
2. **One source of truth for sort order** — keep it server-side in `admin-payouts-list` so pagination stays correct.
3. **Two shared row helpers** — `getPayoutCaption(row)` and `getAccountState(row)` — consumed by the table, mobile cards, and drawer so they cannot drift.
4. **Friendly status pill mapper** shared between table and drawer (`statusPillLabel(status, blocked)`), eliminating raw `awaiting_release` / `pending` strings in the UI.
5. **Tab-aware polling** only on `pending_release` and `processing` tabs — cheaper than blanket polling.
6. **Persist `search` in the URL** (spec implies it but our build didn't sync it).

## Technical notes (for engineering)

Files to edit:

- `src/pages/AdminPayouts.tsx` — lock defaults to All/All time, search-in-URL with debounce, batch retry, post-release refetch cadence, conditional list polling, mount of shared confirm/refund modals.
- `src/components/admin/payouts/PayoutDetailDrawer.tsx` — friendly status pill, hero caption from shared helper, fixed eligibility rendering (pass icon == pass label), pricing `—` for nulls, disabled-style Release/Retry buttons with helper text, refund action, drawer error/not-found states, in-flight polling, "Open Dispute" wiring.
- `src/components/admin/payouts/PayoutsTable.tsx` — adopt shared caption + account-state helpers, add "Release Payout" + "Open Dispute" kebab items, route release/retry through the shared confirm dialog, expose retryable batch state.
- `src/components/admin/payouts/PayoutAdvancedFilters.tsx` — add Bank `missing_recipient` / `no_account` options and Quick Filters `oldest_first`, `needs_review`, `insufficient_balance_risk`. Defaults already correct.
- `src/components/admin/payouts/PayoutBatchBar.tsx` — Retry batch button, balance-warning line, shared confirm dialog wiring.
- New: `src/components/admin/payouts/PayoutConfirmDialog.tsx`, `src/components/admin/payouts/PayoutBatchProgressDialog.tsx`.
- New: `src/lib/payout-presentation.ts` — `statusPillLabel`, `getPayoutCaption`, `getAccountState`.
- `supabase/functions/admin-payouts-list/index.ts` — extend `bank_status` + `quick` enums, per-tab money_status checks, per-tab sort order, server-side `on_hold` filter.
- `supabase/functions/admin-payouts-detail/index.ts` — fix gate `pass` derivation, return `pricing` fields as `null` when absent, add `refund: { allowed, amount, blocker }`, add `payout.retry_blocker_reason`, include inline `investigation` summary.
- `src/services/admin-payouts.service.ts` — type updates for new filter/quick values, nullable pricing fields, `retry_blocker_reason`, refund payload; add `refundBuyer()` wrapper.

No schema changes. No migrations. No new RLS policies.

## Acceptance check

- `/admin/payouts` with no params lands on All / All time / All Statuses / Any Amount / All Accounts / Quick = None / search empty; URL becomes `tab=all&range=all_time`.
- Deep link with `payout_id` opens the drawer; closing it keeps tab, range, search, and all filters.
- Tab badges populate from summary and match the listed rows after the tab-semantic tightening.
- Eye icon, View, Details, and row click all open the drawer without changing the table or row selection.
- Drawer hero status and caption match the row that opened it (friendly labels, no raw enums).
- Eligibility checklist: "No active dispute" shows PASS when no open dispute exists; every gate's icon, color, and label derive from the same boolean.
- Release CTA: disabled style + helper text whenever any gate fails or the payout is not `awaiting_release`. Retry CTA: enabled only when backend `retry_allowed` is true; blocker reason shown when disabled.
- Pricing breakdown shows `—` for missing values, never fake `₦0.00`; hero amount matches Seller Payout row.
- Seller account states (table + drawer) follow the four canonical labels — no contradictions.
- Batch Process opens confirmation modal, runs with progress dialog, continues past per-row failures, summarizes results.
- Loading, empty, and error states use the spec strings; summary failure does not block the list.
