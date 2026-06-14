## Goal

Replace the raw, system-y rows in the Activity Log (`delivered`, `freeze_transaction`, etc.) with the kind of human-readable entries shown in the design — title + one-line context + relative time — and include sensible non-admin signals (logins, payout updates, KYC, transactions, disputes).

## What the user will see

Each row becomes:

- A **bold title** in plain English.
- A **context line** with the most useful detail (related transaction code, location/IP, bank name, etc.).
- A small **source pill** (`Admin`, `System`, `Security`, `Account`).
- **Relative time** ("2 hours ago", "3 days ago").

Examples mapped from real data we already store:

```text
Login from new device           [Security]
IP: 102.89.x.x  Lagos, NG
2 hours ago

Updated payout account          [Account]
Added GTBank ••••4521
3 days ago

Dispute filed                   [System]
SD-2026-000024 - Item not as described
5 days ago

Transaction completed           [System]
SD-2026-000023 - N12,880 released
6 days ago

KYC verification submitted      [Account]
NIN  pending review
8 days ago

Admin froze transaction         [Admin]
SD-2026-000024 - reason: suspicious activity
10 days ago
```

## Data sources to merge (all already exist)

1. `transaction_events` for the user's transactions - covers payment, dispatch, delivery, refund, payout release, dispute open/resolve, admin freeze/unfreeze, agreement lock, auto-cancel, etc.
2. `admin_actions` where the user is the target - covers admin freeze, release funds, internal note, escalate case, open/update investigation, resolve dispute.
3. `audit_logs` - same surface as admin_actions but second-source; deduped by (type + transaction_id + minute).
4. `user_sessions` recent rows - "Login from new device" with IP/city/country.
5. `payout_accounts` - "Added <bank> ••••<last4>" on `created_at`, "Updated payout account" on `updated_at > created_at`.
6. `identity_submissions` - "KYC verification submitted/approved/rejected" using `status`, `created_at`, `reviewed_at`.

## Server changes (single file)

`supabase/functions/admin-user-detail/index.ts`:

- Add the four extra fetches above, scoped to this user, each capped at 20 rows.
- New `humanize()` mapper that converts each raw row to `{ title, context, source, severity, created_at, transaction_code?, transaction_id?, dispute_id? }`. Severity drives the dot colour (red/yellow/emerald/blue/slate).
- Merge → sort by `created_at` desc → return the **30 most recent**.
- Backwards-compatible: keep existing fields (`id, type, note, admin_name, created_at, transaction_id, dispute_id, source`) and add `title`, `context`, `severity`, `transaction_code` as optional.

Title mapping (high level):

```text
transaction_events.payment_received        - "Payment received into escrow"
transaction_events.funds_held              - "Funds held in escrow"
transaction_events.seller_dispatched       - "Seller marked as dispatched"
transaction_events.delivered               - "Delivery confirmed"
transaction_events.buyer_confirmed         - "Buyer confirmed receipt"
transaction_events.payout_released         - "Funds released to seller"
transaction_events.refund_issued           - "Refund issued"
transaction_events.dispute_opened          - "Dispute filed"
transaction_events.dispute_resolved        - "Dispute resolved"
transaction_events.admin_funds_frozen      - "Admin froze transaction funds"
transaction_events.admin_funds_unfrozen    - "Admin unfroze transaction funds"
transaction_events.admin_note_added        - "Admin added internal note"
transaction_events.admin_investigation_*   - "Investigation opened/updated"
transaction_events.agreement_locked        - "Agreement locked"
transaction_events.auto_cancelled          - "Transaction auto-cancelled"
transaction_events.transaction_created     - "Transaction created"
admin_actions.freeze_transaction           - "Admin froze transaction"  (severity high)
admin_actions.release_funds                - "Admin released funds"
admin_actions.escalate_case                - "Admin escalated case"     (severity high)
admin_actions.add_internal_note            - "Admin added note"
admin_actions.resolve_dispute              - "Admin resolved dispute"
admin_actions.open_investigation/update_*  - "Admin opened/updated investigation"
user_sessions (new row)                    - "Login from new device" + IP/city
payout_accounts insert                     - "Payout account added" + bank + last4
payout_accounts update                     - "Payout account updated"
identity_submissions pending_review        - "KYC verification submitted"
identity_submissions approved/rejected     - "KYC verification approved/rejected"
```

Context line builds from the row's data (transaction code when available, IP/city for sessions, bank name + masked last 4 for payouts, status reason for KYC).

## Client changes

`src/pages/AdminUserDetail.tsx` Activity Log card:

- Render `title` as the bold line, `context` (when present) as the muted line under it, then relative time.
- Source pill colour by source: Admin = purple, Security = red, Account = blue, System = slate.
- Dot colour driven by `severity` (high = red, warning = yellow, success = emerald, info = blue, neutral = slate).
- Keep existing empty state.

`src/services/admin-users-directory.service.ts`:

- Extend the `timeline` item type with optional `title`, `context`, `severity`, `transaction_code`.

## Out of scope

- No DB schema changes; no migration.
- No changes to `admin_actions`/`audit_logs`/`transaction_events` write paths - we already auto-link `target_user_id` from the previous fix, so the humanizer can rely on it.
- No changes to admin notes & flags card, recent transactions card, exports, or headers.
- No real-time subscriptions (existing 15-second staleTime on the query is enough).
