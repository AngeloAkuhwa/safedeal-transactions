
## Current state (verified)

- `supabase/functions/admin-transactions-monitor/index.ts` exists with: CORS, JWT verify via `auth.getUser`, `has_role(_user_id, 'admin')` gate, service-role queries, parallel reads, status/money/dispute/escrow label mapping, summary, pagination.
- `src/services/admin-transactions-monitor.service.ts` invokes the function with the user's access token, throws `AdminAccessRequiredError` on 403, redirects on 401.
- `src/pages/AdminTransactions.tsx` renders KPIs, quick filters, search, desktop table, mobile cards, pagination, loading/empty/error/access-denied states. Money is rendered via `formatMoney` (NGN, 2 decimals) with compact tooltips for exact values.

## Gaps vs. the spec

1. **Search is too narrow** — only matches `transaction_code`. Spec implies item title and party names should match too.
2. **"Awaiting Action" KPI is approximate** — should combine `release_review_queue` (pending), failed `payouts`, stuck transactions, overdue dispute responses, and flagged-for-review.
3. **"Flagged" KPI** — currently `needs_release_review` only. Should also include active risk/admin-review signals from `audit_logs` / `admin_actions`.
4. **Tables underused** — spec lists `transaction_participants`, `transaction_status_history`, `transaction_delivery_terms`, `payouts`, `refunds`, `release_review_queue`, `dispute_responses`, `dispute_outcomes`, `admin_actions`, `audit_logs` but the function reads only a subset.
5. **Filter params not all wired in UI** — `moneyStatus`, `disputeStatus`, `riskLevel`, `amountMin/Max`, `dateFrom/To` exist in the API but the page only exposes the quick-filter chips and search.
6. **`hasUnreadMessages` always false** — should be derived (or omitted with an honest `null`).
7. **Risk level inference is heuristic** — keep the heuristic but augment with `admin_actions` (freeze) and `audit_logs` recent risk events.
8. **Design parity check** — confirm the desktop header, KPI tile order/icons, quick-filter chips, 9-column table layout, and mobile card structure still match the shared design at 1246px and 390px viewports. Adjust spacing, badge tones, and the "Live sync" pill if drift is found.

## Changes

### A. Edge function (`supabase/functions/admin-transactions-monitor/index.ts`)

- **Search**: when `search` is set, run parallel pre-queries to resolve matching ids:
  - `transactions.transaction_code ilike %s%`
  - `transaction_items.title ilike %s%` → ids
  - `profiles.full_name/email ilike %s%` → user ids → `transactions` where `buyer_id`/`seller_id` in (ids)
  - Union the id sets and apply `.in("id", unionIds)`.
- **Awaiting Action KPI** — compute as the union (deduped) of, restricted to the filtered scope:
  - `release_review_queue` rows with status pending,
  - transactions whose latest `payouts.status = 'failed'`,
  - active disputes with `seller_response_due_at < now()`,
  - transactions stuck in `awaiting_payment` > 24h,
  - `needs_release_review = true`.
- **Flagged KPI** — `needs_release_review = true` ∪ transaction ids referenced by recent `audit_logs` actions tagged as risk/fraud ∪ `admin_actions.action_type` in (freeze, flag).
- **Per-row enrichment**:
  - `lastActivityAt` — also consider latest `transaction_status_history.changed_at`.
  - `flags[]` — append `payout_failed`, `admin_frozen` (from `admin_actions`), `risk_flagged` (from `audit_logs`).
  - `actionAvailability.canFreeze` — also false if a recent `admin_actions` freeze exists.
  - `hasUnreadMessages` — set to `null` (omit from UI) until a messages source exists; do not fake.
- **Performance**: keep all enrichment parallel via `Promise.all`; cap fan-out for KPI sums at 5k ids (already in place).

### B. Frontend service (`src/services/admin-transactions-monitor.service.ts`)

- Add the new optional params on `AdminTxMonitorParams` (already present); no breaking changes.
- Surface `hasUnreadMessages?: boolean | null` on `AdminTxRow`.

### C. Page (`src/pages/AdminTransactions.tsx`)

- **Filters drawer**: expand the existing "Filters" panel (currently just Clear) to include:
  - Transaction Status, Money Status, Dispute Status, Risk Level (selects from mapping enums),
  - Amount min/max (numeric, NGN),
  - Date from / to (date inputs).
  - All wired to API params; reset page to 1 on change.
- **Mobile**: same filters behind the existing toggle; quick-filter chips remain.
- **Design parity**:
  - Re-check the KPI tile order: Total Tx, Total Amount, In Escrow, In Dispute, Awaiting Action, Flagged (matches spec).
  - Verify the 9 desktop columns: Transaction, Item, Parties, Amount, Status, Escrow, Flags, Last Activity, Actions.
  - Mobile card hierarchy: code+date, status badge, item, buyer/seller, optional risk row, amount + actions.
  - Confirm `Live` pill uses emerald token in both themes.
- Hide the unread-messages indicator when `hasUnreadMessages` is `null`.

### D. QA pass (no code, just verification)

- Resize preview to 1280×720 and 390×844, compare each section to the shared design.
- Verify NGN formatting: every money string ends in `.00` (or 2 decimals) and uses `₦`.
- Confirm 401 → `/auth`, 403 → access-denied panel, network error → red banner with Retry.
- Run the function with no filters, with `quickFilter=in_dispute`, and with a search term to confirm KPIs and rows update consistently.

## Out of scope (not needed for acceptance)

- Real messages/unread system — left stubbed as `null`.
- Advanced sort UI (column header click); API supports it but UI keeps `created_at desc`.
- CSV export pipeline; current Export button still toasts.
