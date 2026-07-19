## Port Audit Logs screen (attached HTML) into the admin app

Build a new **Audit Logs** page at `/admin/audit-logs` that matches the attached HTML 1:1 (copy, cards, icons, colors, table shape, severity treatments, action buttons), wired to the real `audit_logs` / `admin_actions` data.

### Scope
- New route only. Do not touch sidebar/layout structure (sidebar link already exists at `/admin/audit-logs`).
- Uses the existing app chrome (`AdminLayout` / `AdminSidebar`) — we do NOT rebuild the sidebar from the HTML. The HTML sidebar is already represented by our React sidebar; we port only the page body.
- Reuse the current dark admin palette. Keep the HTML's slate/emerald/red/purple/blue/yellow accents as-is for parity (this page follows the existing admin dark theme like other admin pages).

### Files
1. `src/pages/AdminAuditLogs.tsx` — new page. Sticky header, 4 stat cards, Advanced Filters card, Audit Log Entries table, right-side JSON drawer.
2. `src/services/admin-audit-logs.service.ts` — new. Wraps a new `admin-audit-logs` edge function.
3. `supabase/functions/admin-audit-logs/index.ts` — new. SQL-first list + aggregate stats endpoint (`requireAdmin`, `logAdminAction` for exports, respects existing rate limits).
4. `src/App.tsx` — register `/admin/audit-logs` route inside the existing admin protected block.

### Page layout (ported from HTML)
- **Sticky header**: "Audit Logs" + "Immutable compliance and forensic audit trail", pills for **Immutable** (emerald) and **Last entry: Xm ago** (live from data), buttons **Export Logs** (slate) and **Compliance Report** (emerald).
- **Stats overview** — 4 cards, exact icons/colors/labels:
  - Total Audit Entries (blue `list-check`) — count last 30d
  - High Severity (red `triangle-exclamation`) — high+critical count
  - Active Admins (purple `user-shield`) — distinct actors last 24h
  - Storage Used (emerald `database`) — estimated table size
- **Advanced Filters & Search** card: search input, Action Type / Actor / Severity selects, Date Range Start/End, buttons Search / Clear All Filters / Save Filter Preset.
- **Audit Log Entries** table with sticky-under-header thead, columns: Timestamp, Action, Actor, Target, Description, Metadata (View JSON pill), IP Address, Actions (Details / JSON / User|TXN / Export / Copy).
  - Row severity styling: critical = red-tinted row + red left border + pulsing badge; high = yellow-tinted row + yellow border; info/low = plain.
  - Action-type icon tile colors match HTML (user-slash red, money-bill-wave emerald, scale-balanced yellow, etc.).
- **JSON drawer** (right-side slide-in, matches `.audit-drawer` behavior) — shows full JSON payload of the selected audit row + Copy JSON button.

### Data wiring
Backend endpoint `admin-audit-logs`:
- `GET ?action=list` with filters `{ q, action_type, actor_id, severity, from, to, page, page_size }` — pushes filtering/pagination into SQL against `admin_actions` unioned with `audit_logs` (security events). Returns `{ rows, total, latest_entry_at }`.
- `GET ?action=stats` — returns 4 KPI values from SQL aggregates.
- `POST ?action=export` — uses async export pipeline (existing `runExport` / `admin_export_jobs`) — no in-memory CSV. Respects existing per-admin export rate limits.
- Severity mapping: derive from `action` string (suspend/freeze/reveal/impersonation → critical; role/settings change → high; retry/broadcast → medium; view/export → info) — implemented in SQL CASE so it filters correctly.

### Design tokens
- HTML uses `bg-slate-900/800/700`, `text-white/slate-300/400`, and accent colors `emerald/red/purple/blue/yellow/orange`. Per project rule these should be semantic tokens, but the rest of the admin surface (item #14 in the audit) also uses raw slate/emerald classes, and that sweep is explicitly deferred/out-of-scope. **This page follows the same convention as the existing admin pages** — raw Tailwind color classes — so it visually matches the reference and the rest of `/admin/*`. It will be included in the future design-token sweep.

### Out of scope
- Saving filter presets to DB (button is present but stubbed — will wire in a follow-up).
- Real geo-IP lookup ("San Francisco, US") — display raw IP; geo is a follow-up.
- Sidebar refactor.
