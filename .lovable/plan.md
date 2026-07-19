## Goal
Make `/admin/audit-logs` fully data-driven end-to-end — every filter, KPI, row action, CTA, and download actually works against real data, with no dead buttons and no placeholder toasts.

## Gaps found (verified)
1. **Export button is wired to a type the backend doesn't accept.** `runExport("audit_logs", …)` posts to `admin-export-enqueue`, but `SUPPORTED_TYPES` only includes `escrow`, `users_directory`, `flagged_users`, `transactions_monitor`, `user_detail`. Every export click currently returns `unsupported_export_type`.
2. **No CSV builder for audit logs** in `admin-export-worker` (`BUILDERS` map).
3. **Compliance Report CTA is a placeholder toast** (`"Compliance report coming soon"`).
4. **Severity filter is ignored server-side.** The edge function reads `severity` but never applies it (severity is regex-derived from `action_type`).
5. **Search (`q`) is too narrow.** Only matches `action_type` / `action_notes` / id — not actor name, target user id, transaction/dispute ids, or transaction codes.
6. **Facets are stale.** The Action Type and Actor dropdowns are built from the current page's 50 rows, so the true option set is invisible.
7. **KPI card "Storage Used"** is a fabricated `total * 512` estimate — misleading. Compute it from actual JSONB payload sizes or drop to a real proxy.
8. **No realtime.** New admin actions don't stream in; a manual refetch is needed.
9. **No refresh button** and no visible "auto-refresh" affordance even though stats silently refetch every 60s.
10. **Table lacks per-row deep links validation** — Details/User/TXN/Dispute buttons rely on IDs but there's no fallback state, and there's no "Copy ID"/"Copy JSON" success surface beyond a small toast.
11. **JSON drawer** — the "View JSON" and "Details" row buttons both open the same drawer; that's fine, but the drawer doesn't surface `before`/`after` diffs even though the edge function returns them.
12. **Pagination** shows Previous/Next only — no direct page count or page-size selector, and no jump-to-first when filters change (that part actually works via `doSearch`, keep).

## Plan (data + wiring only, minimal UI adjustments)

### A. Edge function — `admin-audit-logs`
- **Add `action=facets` mode.** Returns:
  - `action_types`: distinct `action_type` values from the last 90d, ordered by count desc, capped at 200.
  - `actors`: top 100 recent admin actors (`id`, `full_name`, `email`, `role`) joined from `admin_actions` + `profiles` + `user_roles`.
- **Apply severity server-side** by translating the requested severity into an `action_type` regex whitelist (same buckets as `severityFor`) and using `.in("action_type", …)` for exact match or a list of `or(action_type.ilike.…)` chained conditions.
- **Broaden `q` search:**
  - If UUID → match `id`, `target_user_id`, `transaction_id`, `dispute_id`.
  - Otherwise → `action_type ilike`, `action_notes ilike`, plus lookup target profiles by `full_name`/`email` (fetch matching ids first, then include in an `.in("target_user_id", …)` clause) and match `transactions.transaction_code` (fetch matching txn ids first).
- **Stats:** replace `storage_bytes = total * 512` with `sum(octet_length(action_notes::text))` over the last 30 days via a lightweight RPC or `.select("action_notes")` chunk (cap 10k rows) — return a real number and label it "Payload storage (30d)". If cheaper, keep 512·N but rename to "Est. storage (30d)".

### B. Edge function — new `admin-audit-compliance-report`
- Generates a scheduled compliance summary and enqueues an export.
- Input: `range` (`24h` | `7d` | `30d` | custom `from`/`to`), optional `severity` (defaults to `["critical","high"]`).
- Behaviour: calls `admin-export-enqueue` server-to-server with `export_type = "audit_logs"` and params `{ severity: "high", from, to, compliance: true }`, then returns `{ job_id }`. Client uses the standard `runExport`-style polling.
- Writes an `admin_actions` row (`action_type = "audit_compliance_report"`) via `logAdminAction` for traceability.

### C. Export pipeline
- **`admin-export-enqueue`:** add `"audit_logs"` to `SUPPORTED_TYPES`.
- **`admin-export-worker`:** add `buildAuditLogsCsv` builder registered under `audit_logs`. It:
  - Accepts the same filter params as list mode (`q`, `action_type`, `actor_id`, `severity`, `from`, `to`, `compliance` flag).
  - Streams `admin_actions` in chunks of 1000 ordered by `created_at desc`, hydrating actor + target profile names in batches.
  - Emits header: `id, created_at, action_type, severity, actor_id, actor_name, actor_email, actor_role, target_user_id, target_user_email, transaction_id, dispute_id, ip, user_agent, reason, changed_keys, description`.
  - If `compliance = true`, prepends a two-line CSV preamble (`# Compliance report — generated <iso>, range <from>→<to>, filter severity=high+critical`).
- **`src/services/admin-escrow.service.ts`:** extend `ExportType` union with `"audit_logs"`.

### D. Client service — `admin-audit-logs.service.ts`
- Add `fetchAuditFacets()` returning `{ action_types: string[]; actors: AuditActor[] }`.
- Add `runComplianceReport(range)` helper that calls the new function and polls via existing `getExportStatus` + resolves to a signed URL.

### E. Page — `src/pages/AdminAuditLogs.tsx`
- **Data:**
  - New `useQuery(["admin-audit-facets"], fetchAuditFacets, { staleTime: 5 * 60_000 })`. Use `facets.action_types` and `facets.actors` for the two dropdowns instead of deriving from `rows`.
  - Add a `useEffect` that subscribes to Supabase Realtime on the `admin_actions` table (INSERT). On event, invalidate `admin-audit-list` and `admin-audit-stats` (throttled ≤ once per 3s using the existing `useAdminRealtimeChannel` helper).
- **Toolbar:**
  - Wire **Export Logs** to the corrected `runExport("audit_logs", applied)` — same behaviour, now actually works.
  - Wire **Compliance Report** to `runComplianceReport("30d")` with the same polling + `window.open(url)` flow, plus a success/failure toast.
  - Add a **Refresh** ghost `Button` that calls `listQ.refetch()` + `statsQ.refetch()` + `facetsQ.refetch()`.
- **Filters:**
  - Populate Action Type / Actor from facets query.
  - Add a small **Quick Range** row (`24h`, `7d`, `30d`, `Custom`) above the datetime inputs that sets `from`/`to`; keep the two datetime-local inputs for custom ranges.
  - Ensure `doSearch` also resets `applied.page` to 1 (already does — keep).
- **Table:**
  - Row click on the description cell (or a new "Open" affordance) opens the drawer — keep JSON/Details buttons but dedupe (JSON opens drawer, Details opens drawer). Change Details button icon/label to "Open" to remove redundancy.
  - Fall back to a `—` cell when `ip` is null (already handled) and keep target rendering unchanged.
- **Drawer:**
  - When `row.before` or `row.after` is present, render a "Changes" section that lists each key in `row.changed_keys` with `before → after` values (shortened to 120 chars). Keep the raw JSON block below.
  - Add secondary "Open user profile" / "Open transaction" / "Open dispute" links that mirror the row buttons (uses the same URLs), inside the drawer footer.
- **Pagination:** add a page-size `<select>` (25 / 50 / 100) next to Previous/Next that updates `applied.page_size` and resets to page 1.

### F. Cleanup / no-regression
- Keep the redesigned tokens/spacing from the last pass — no styling changes here.
- All existing hooks, action-icon mapping, severity pill logic, deep-link routes, and copy-id behaviour stay identical.
- No schema changes; `admin_actions` and `audit_logs` tables are untouched.

## Verification checklist
1. Filter by each severity (`critical` → `info`) and confirm the row count changes and rows only contain matching actions.
2. Search by actor name, target user email, transaction code, and a raw UUID — each returns matching rows.
3. Action Type + Actor dropdowns show options that are not on the current page.
4. Export Logs downloads a CSV containing every row across pages that match current filters.
5. Compliance Report downloads a CSV with the preamble and only critical/high rows from the last 30 days.
6. Realtime: perform any admin action in another tab → new row appears within a few seconds without manual reload.
7. Drawer shows before/after diff when `changed_keys` is present (e.g. settings update rows).
8. All row buttons navigate to the right admin sub-page.
9. Refresh button forces a fresh fetch of list + stats + facets.
10. `edge_function_logs("admin-audit-logs")` and `("admin-export-worker")` show no errors after these interactions.