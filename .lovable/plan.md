## Next action item

**#11 — Render before/after diff in the AdminSettings Audit History (finish Batch D).**

The unified `logAdminAction` helper now stores a JSON payload in `admin_actions.action_notes` with the shape:

```
{ reason, target_type, target_id, changed_keys[], before{}, after{}, metadata{}, ip, user_agent }
```

The Audit History tab in `src/pages/AdminSettings.tsx` still only understands the legacy shape (`{ scope, updates, timeouts }`) and the "Export Full Log" button is a toast placeholder. So a supervisor cannot answer "who changed X from Y to Z" — the ask in item #11.

### Changes

1. **`src/services/admin-settings.service.ts` — extend `SettingsAuditRow`**
   - Add parsed fields derived once in the service:
     - `reason: string | null`
     - `changed_keys: string[]`
     - `before: Record<string, unknown>`
     - `after: Record<string, unknown>`
     - `metadata: Record<string, unknown> | null` (keeps `scope`, `vendor_id`, `apply_to_all_vendors`)
   - Handle both shapes: new unified payload (`before` / `after` present) and legacy `{ scope, updates, timeouts }` (fall back to synthesising `changed_keys` from `updates` + timeouts).
   - Keep raw `action_notes` for backwards compatibility.

2. **`src/pages/AdminSettings.tsx` — Audit row renderer**
   - Replace the inline JSON re-parse in `AuditRow` with the pre-parsed fields.
   - Header line: `Updated N settings` (from `changed_keys.length`), plus Platform/Vendor/"Applied to all" pills as today.
   - New collapsible diff table when `changed_keys.length > 0`:
     ```
     escrow.auto_release_hours       48h  →  72h
     escrow.auto_release_enabled     true →  false
     ```
     - Values rendered via a `formatSettingValue()` helper (boolean → Yes/No, numbers/strings shown raw, objects → truncated JSON).
     - When the diff spans nested groups (e.g. `settings`/`timeouts` on system-settings saves), flatten one level so each real key shows on its own row.
     - Show first 6 rows, "+N more" toggle for the rest.
   - Show `reason` in italics under the header (existing).
   - Footer meta: admin name · target vendor · relative time · IP (if present, monospace, muted).

3. **"Export Full Log" button**
   - Wire to a CSV download built client-side from the already-loaded `auditRows`: columns `created_at, admin, action_type, target, changed_keys, before, after, reason, ip`. No new backend surface; async job pipeline for the full corpus is out of scope for this item.

### Not in this pass

- No new edge functions, no schema change (`action_notes` already holds the diff as JSON).
- No changes to other admin pages' audit surfaces — Settings is the one called out in #11.
- Impersonation (#13), scoped realtime (#12), design-token sweep (#14), integration tests (#16) remain the next queued items after this ships.

### Files touched

- `src/services/admin-settings.service.ts` (parsing + type expansion)
- `src/pages/AdminSettings.tsx` (`AuditRow` render + Export button handler)