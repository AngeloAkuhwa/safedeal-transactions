## Next action: Batch D — Audit integrity (Items #10 & #11)

Item #7 (tsvector search) shipped last turn. The last remaining P1/P2 correctness gap in the approved order is the patchy admin audit trail. The shared helper `supabase/functions/_shared/audit.ts::logAdminAction` already exists and already computes a JSONB diff (`changed_keys` / `before` / `after`) — but only 2 of ~14 admin mutation functions actually call it. The rest still hand-roll `admin_actions` and/or `audit_logs` inserts with inconsistent field shapes, no diff, and (in a few cases) an audit row on only one of the two tables.

This batch adopts the helper everywhere and surfaces the diff in the Settings UI.

### What to build

1. **Refactor every admin mutation edge function to `logAdminAction`.** Replace hand-rolled inserts in:
   - `admin-export-transaction-data`
   - `admin-notifications-action` (retry + broadcast-create)
   - `admin-user-detail-export`
   - `admin-escrow-alert-settings`
   - `admin-flagged-users-bulk`
   - `admin-vendor-status`
   - `admin-review-identity` (3 sites; approve/reject/note)
   - `admin-flagged-users-action`
   - `admin-transaction-actions` (all 10 action sites — freeze/unfreeze/refund/release/etc.)
   - `admin-reveal-user-field`
   - `admin-system-settings` (keep the dedicated `toggle_auto_release` event but route it through `logAdminAction` so the diff column is populated)
   - `_shared/security-resolver.ts` insert
   
   Every call passes `actorId`, `action`, `targetType`/`targetId`, `before`/`after` where applicable, `reason` from the request body, and `mirrorToAuditLogs: true` for security-sensitive events (identity reveal, freeze/unfreeze funds, dispute resolution, refund, impersonation stubs, role change).

2. **Small helper hardening in `_shared/audit.ts`.**
   - Add `disputeId` mapping into the `admin_actions.dispute_id` column (already accepted in the type; ensure it's written).
   - Add an `ip`/`userAgent` extraction utility `extractRequestMeta(req)` so callers don't repeat header parsing.
   - Never throw from `logAdminAction` — audit failures must not fail the underlying admin operation (already the case; add a `console.warn` on failure so it surfaces in edge logs).

3. **Surface the diff in `AdminSettings.tsx` Audit History (Item #11).**
   - Parse the new `changed_keys` / `before` / `after` fields from `action_notes` in the audit row renderer.
   - Under the existing summary line, render a compact key → "old → new" table (max 6 rows, "+N more" for the rest). Reuse existing card styling; no new design tokens.
   - Wire the placeholder "Full audit log export" button to the existing async export pipeline (out of scope if it requires new infrastructure — otherwise reuse `runExport` with a new `admin_audit_log` job type; only add the job type if it fits in this batch, otherwise leave the toast).

4. **Verification**
   - Trigger one action per refactored function via the UI or `curl` and confirm the resulting `admin_actions` row contains the expected `changed_keys` / `before` / `after` JSON in `action_notes`.
   - Save a setting change in AdminSettings; verify the Audit History card shows the key-level diff.
   - Confirm no admin mutation returns a 500 due to audit failures (kill-switch test: temporarily point the helper at a bad table name locally to prove the operation still succeeds).

### Technical notes
- `admin_actions.action_notes` is `text` — we keep JSON-stringifying the notes payload (existing convention). No schema change needed.
- The helper already mirrors to `audit_logs` when `mirrorToAuditLogs: true`; per-function decisions on whether to mirror are captured in the refactor above.
- No migration needed for Batch D.

### Out of scope for this batch
- Item #12 (scoped realtime), Item #13 (impersonation TTL) — next batch.
- The design-token sweep (#14).
- Any AdminSettings UI redesign beyond adding the diff rows to the existing card.

### After this ships
Batch E — Security hardening: #12 scoped realtime channels for `useRealtimeAdminNotifications`, #3 AAL2 enforcement follow-through (helper + admin header enrollment CTA). Impersonation (#13) still deferred to the end as a separate feature workstream per your instruction.
