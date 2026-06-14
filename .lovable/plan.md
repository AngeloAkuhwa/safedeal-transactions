## Root cause

The "Activity Log" on the user investigation page is always empty because the data isn't linked to users the way the page filters it.

- The page calls the `admin-user-detail` endpoint, which builds the activity timeline by selecting only `admin_actions` rows where `target_user_id = <this user>`.
- In the database today, **0 of 12** `admin_actions` rows and **0 of 8** `audit_logs` rows have a `target_user_id` set. Every row is linked only to a `transaction_id` (or `dispute_id`).
- So the filter always returns nothing — for every user, no matter what.

This is consistent with how rows get created: most admin/transaction edge functions and SQL triggers insert into `admin_actions`/`audit_logs` with `transaction_id` but never populate `target_user_id`. Only a few flows (flag/clear/suspend on the flagged-users action, identity review, and the user export/reveal helpers) currently set `target_user_id`.

## What I'll change

### 1. Backfill existing rows so old activity shows up
One-time data fix:
- For every `admin_actions` row with `target_user_id IS NULL` and a `transaction_id`, set `target_user_id` to the related transaction's `seller_id` (sellers are the most relevant party for admin freeze/release/note/escalate actions).
- Same backfill on `audit_logs`.
- Where the row is linked only to a `dispute_id`, derive the transaction via the dispute and use the same seller-based rule.

### 2. Auto-link future rows at the database layer
Add a `BEFORE INSERT` trigger on `admin_actions` and `audit_logs` that, if `target_user_id` is null, derives it from `transaction_id` → `seller_id` (or from `dispute_id` → transaction → seller). This is a safety net so we never silently lose the user link again, even if a future edge function forgets to set it.

### 3. Widen the timeline query
Update `supabase/functions/admin-user-detail/index.ts` so the activity feed for a user merges three sources and returns the most recent 30 entries:
- `admin_actions` where target user matches OR where the transaction/dispute belongs to this user (covers buyer side too).
- `audit_logs` with the same widened filter.
- `transaction_events` for any transaction where the user is buyer or seller (gives state-change context like "payment secured", "funds released").

Each entry is normalized into the existing timeline shape with an extra `source` tag (`admin_action | audit | transaction_event`) so the UI can keep its existing dot/colour logic and just render a small source label.

### 4. Light UI polish on the Activity Log card
- Add a small grey "source" pill on each timeline row.
- Keep the existing empty state, dot colours, and "Add note" affordances unchanged.
- No design or layout changes.

### 5. Going forward
No application code changes are required at the existing insert sites, because the new DB trigger fills in `target_user_id` automatically. We can tighten individual edge functions later if needed, but this plan keeps the surface area small.

## Out of scope
- No change to the user-detail export endpoints or the compliance flow.
- No change to admin notes/flags card data source.
- No RLS changes (existing admin-only policies on both tables remain).
- No new tables.

## Technical notes
- Files touched: one new migration (backfill + trigger + helper function), `supabase/functions/admin-user-detail/index.ts`, `src/pages/AdminUserDetail.tsx` (source pill only), and the timeline type in `src/services/admin-users-directory.service.ts` (add optional `source` field).
- Backfill uses `UPDATE … FROM transactions/disputes` and is idempotent (only touches rows where `target_user_id IS NULL`).
- Trigger is `SECURITY DEFINER` with a pinned `search_path` and only fires when `target_user_id IS NULL` so it never overrides an explicit value.
