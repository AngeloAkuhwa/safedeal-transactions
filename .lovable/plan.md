## Revised plan — keep Auto-Release, make it configurable + auditable

### 1) Auto-Release stays, but is a togglable, audited setting

**UI (`src/pages/AdminSettings.tsx`)**
- Keep the "Auto-Release Payments" toggle in the Escrow Alerts card.
- Keep the "Auto-Release After Delivery" hours input in the Timeout Rules card, but **disable it when the toggle is OFF** (grey out + helper text: "Enable Auto-Release to configure the window").
- Default posture on this platform: **OFF** (manual release from the Payouts page). Admin can flip it ON per platform or per vendor.
- Show the standard "Overridden" badge when a vendor has its own value.
- Show a small meta line under the toggle when ON: *"Enabled by {admin_name} on {date} at {time}"* — pulled from the audit fields below.

**Persisted keys (unchanged names)**
- `escrow.auto_release_enabled` (boolean) — writable at both `platform` and `vendor` scope.
- `auto_release_after_delivery_hours` timeout rule — same dual scope.

### 2) Capture WHO / WHEN toggled Auto-Release (source of truth)

Two complementary layers so audit stays intact even if the row is later edited:

**a. On the `system_settings` row itself** (fast read for the meta line):
- Add three columns: `auto_release_enabled_by uuid` (FK to `auth.users`), `auto_release_enabled_at timestamptz`, `auto_release_previous_value text`.
- Populated **only** for rows where `setting_key = 'escrow.auto_release_enabled'`.
- Filled by a `BEFORE UPDATE`/`BEFORE INSERT` trigger `track_auto_release_toggle()` that:
  - Fires only when `setting_key = 'escrow.auto_release_enabled'` **and** `setting_value` actually changed.
  - Reads the acting admin from `updated_by` (already set by `admin-system-settings`).
  - Stamps `auto_release_enabled_at = now()` and captures the prior value.

**b. In `admin_actions` (full immutable history)**:
- The `admin-system-settings` PUT already writes `action_type = 'update_setting'` with the payload. Extend the payload writer so that when the payload includes `escrow.auto_release_enabled`, we also write a **dedicated** `admin_actions` row with `action_type = 'toggle_auto_release'`, `target_scope` (`platform` or `vendor`), `target_vendor_id` (nullable), `previous_value`, `new_value`, `reason`.
- This gives the Audit History card a distinct, filterable event stream for auto-release changes.

### 3) Runtime behaviour (must match the toggle)

- `admin-system-settings` PUT: allow `escrow.auto_release_enabled` at both scopes; clamp via catalog (`boolean` type).
- `_shared/settings-resolver.ts`: expose `loadEffectiveAutoRelease(vendorId)` → `{ enabled: boolean, window_hours: number, enabled_by, enabled_at }`.
- Any release consumer must read this resolver before releasing. Since we have **no auto-release cron today**, this phase only wires the setting + audit; the future cron worker will consume `loadEffectiveAutoRelease`. Nothing is auto-released until that worker exists — the Payouts admin button remains the only release trigger for now.
- Add a **banner on the Payouts page** when Auto-Release is ON for the vendor being viewed: *"Auto-Release is ON for this vendor — enabled by {admin} on {date}."* Read-only signal; no behaviour change until the cron worker ships.

### 4) `$` → `₦` fix + sensible NGN defaults (unchanged from prior turn)

- `AdminSettings.tsx` lines 571 and 611: swap `$` → `₦` on "High-Value Transaction Alert" and "ID Verification Threshold".
- Reseed platform defaults if still at `5000` / `10000`: ID threshold **₦100,000**, high-value alert **₦500,000** (confirm numbers).
- Add one-line help text under each field explaining the purpose.

### 5) Catalog + clamping

- `src/lib/settings-catalog.ts` + `supabase/functions/_shared/settings-catalog.ts`:
  - `escrow.auto_release_enabled` → `boolean`, writable `["platform","vendor"]`.
  - `auto_release_after_delivery_hours` rule → number, min 1, max 720 (30 days), writable at both scopes.
  - `security.id_verification_threshold` and `risk.high_value_alert_ngn` → number, NGN, min 1000, max 50000000.

### 6) Files this change touches

**DB migration (schema)**
- Add columns to `system_settings`: `auto_release_enabled_by`, `auto_release_enabled_at`, `auto_release_previous_value`.
- Add trigger `track_auto_release_toggle()` + `BEFORE INSERT OR UPDATE` binding on `system_settings`.

**Data change (insert tool)**
- Update the two threshold defaults from `5000`/`10000` to NGN values if present.

**Backend**
- `supabase/functions/admin-system-settings/index.ts` — dedicated `toggle_auto_release` `admin_actions` write; ensure `updated_by` set before write so the trigger sees the acting admin.
- `supabase/functions/_shared/settings-resolver.ts` — new `loadEffectiveAutoRelease(vendorId)`.
- `supabase/functions/_shared/settings-catalog.ts` — entries above.

**Frontend**
- `src/pages/AdminSettings.tsx` — enable/disable coupling, `$` → `₦`, meta line "Enabled by … on …", overridden badges.
- `src/lib/settings-catalog.ts` — mirrored entries.
- Payouts page (`src/pages/admin/…Payouts.tsx`) — read-only banner when auto-release enabled for the viewed vendor.

### 7) Audit history rendering

- `AdminSettings.tsx` audit card: when the row is a `toggle_auto_release`, render a distinct pill ("Auto-Release: OFF → ON") with the actor, timestamp, scope, vendor (if any), and reason. Falls back to the generic renderer for other updates.

## Confirmations before build

1. Default posture: keep Auto-Release **OFF** by default at platform scope? (Recommended.)
2. NGN defaults: ID threshold **₦100,000**, High-value alert **₦500,000** — OK?
3. Auto-release window default when the toggle is first flipped ON: **48 hours** OK?
