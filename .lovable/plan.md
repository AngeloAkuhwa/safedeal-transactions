## Goal

Replace the hardcoded escrow alert thresholds (Frozen >30d, Overdue >5d, Idle >15d, plus mismatch detection) with a dynamic, admin-editable configuration. Wire the existing "Configure Alerts" button to a real settings modal, and gate writes behind an admin permission check that can later be tightened to a specific clearance level.

## What changes

### 1. Storage — `system_settings`
Use the existing `public.system_settings` table (JSONB key/value, admin-only RLS already in place). One row:

- `setting_key = 'escrow_alert_thresholds'`
- `setting_value` JSONB:
  ```json
  {
    "frozen_days": 30,
    "overdue_days": 5,
    "idle_days": 15,
    "mismatch_min_delta": 0.01,
    "high_value_amount": 1000000,
    "updated_by": "<uuid>",
    "updated_at": "<iso>"
  }
  ```

Seeded by a new migration with the current defaults so behavior is unchanged on day one.

### 2. Backend — `admin-escrow-overview` edge function
- Load the thresholds row once per request (fallback to current defaults if missing).
- Replace hardcoded `30`, `5`, `15`, `0.01` in the alert queries with values from settings.
- Return the active thresholds in the response (`alerts.thresholds`) so the UI can display them in the footer strip and the modal can preload them without a second round trip.

### 3. Backend — new `admin-escrow-alert-settings` edge function
- `GET` → returns current thresholds + last updater (admin only).
- `PUT` → validates payload (positive integers, sensible ranges), writes to `system_settings`, logs to `admin_actions` with `action_type = 'settings_update'` (already in the enum), returns updated row.
- Auth via `requireAdmin` (existing helper). Permission gate is centralized in one helper so we can swap it for a finer-grained check later (see §5).

### 4. Frontend
- New service `src/services/admin-escrow-alerts.service.ts` with `getThresholds()` / `updateThresholds()`.
- New `ConfigureAlertsModal` component (shadcn `Dialog` + `Input` + `Button`), opened from the existing "Configure Alerts" button in `EscrowAlertsPanel`. Fields: Frozen days, Overdue days, Idle days, High-value amount, Mismatch tolerance. Inline validation, optimistic save, toast on success/failure.
- Footer strip text ("Frozen >30d | Overdue >5d | Idle >15d | Any state mismatch") becomes data-driven from `alerts.thresholds`.
- Button is hidden / disabled with a tooltip ("Requires admin clearance") when the user lacks permission.

### 5. Permission gating (designed for future tightening)
Phase A (now): gate on `has_role(auth.uid(), 'admin')` using the existing helper. One central function `canConfigureEscrowAlerts(userId)` on both client and server.

Phase B (later, not built now but the seam is ready): introduce a granular permission such as `escrow.alerts.configure` stored in a new `admin_permissions` table or a new `app_role` value like `finance_admin`. Only `canConfigureEscrowAlerts` needs to change; the modal, service, and edge function stay the same.

## Out of scope
- Building the finer-grained permission model itself (Phase B).
- Changing alert categories, copy, icons, or the alerts UI layout.
- Notification routing (who gets pinged when a threshold trips).

## Technical notes
- Migration: insert default row if not present (`ON CONFLICT (setting_key) DO NOTHING`); no schema change to `system_settings`.
- Edge function CORS: include `PUT, OPTIONS, GET` in `Access-Control-Allow-Methods` per project convention.
- Client uses direct `fetch` for the `PUT` (project rule — SDK `invoke()` is avoided for PATCH/PUT/DELETE).
- All threshold reads on the server happen inside the edge function — UI never queries `system_settings` directly.
