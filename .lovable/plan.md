## Diagnosis

Edge function logs show:
```
code: 42702, message: 'column reference "full_name" is ambiguous'
```

Cause: `admin_users_directory_page` RPC declares `RETURNS TABLE(... full_name text ...)`. Those OUT columns share names with the view columns (`full_name`, `email`, `phone`, `roles`, `derived_status`, `verification_level`, etc.). Inside the `filtered` CTE's `WHERE` clause I used unqualified `full_name ILIKE ...`, which Postgres can't disambiguate between the OUT-parameter and the base column, so every call throws 42702 and the UI shows "Failed to load users / Failed to fetch".

## Fix

Rewrite `public.admin_users_directory_page` so every column reference inside the CTEs is qualified with its table alias:

- `filtered` CTE: `base.full_name`, `base.email`, `base.phone`, `base.roles`, `base.default_role`, `base.derived_status`, `base.verification_level`.
- `ORDER BY` in the final SELECT: use `c.full_name`, `c.disp_active`, `c.joined_at`, `c.last_active_at`, `c.tx_volume`, `c.tx_count` (already aliased — keep as-is).

No signature change, no view change, no client change. Wire shape stays identical.

## Verification

1. `supabase--read_query` → `SELECT user_id, full_name, total_count FROM public.admin_users_directory_page(_search := 'a', _from := 0, _to := 4);` (via service role — the RPC currently returns permission_denied under anon; re-check via edge function instead).
2. `supabase--edge_function_logs` for `admin-users-directory` → confirm no more 42702.
3. User reloads `/admin/users` and sees rows.
