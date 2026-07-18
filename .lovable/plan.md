# Settings Rollout — Final Audit & Fix Plan

I scanned the repo end-to-end. Most of the 12 items are actually done (catalog+clamp exists, badges on all fields, timeout consumers wired, escrow alerts accept `?vendor_id=`, pricing cap/version are config-aware, tests exist, `EffectiveSettingsPanel` is mounted). **The important remaining problem is not the plan checklist — it's that several settings the admin can save are never read by the running system.**

## What I verified as DONE

- `_shared/safedeal-money-policy.ts` cap and `pricing_model_version` are config-aware (`computePricingModelVersion(config)`, `config.max_total_service_fee ?? FALLBACK`).
- `admin-escrow-alert-settings` supports `?vendor_id=` (platform + vendor scope).
- All 4 timeout consumers (`create-transaction`, `cart-checkout`, `storefront-checkout`, `claim-offer`) call `loadEffectiveTimeoutHours`.
- Settings catalog exists on both client and server; `admin-system-settings` PUT calls `clampSetting`.
- `AdminSettings.tsx` shows "Overridden by vendor" badges on every overridable field + locked badges on platform-only fields.
- `EffectiveSettingsPanel` is created and mounted on `SellerProfileSettings.tsx`.
- Tests: `pricing.test.ts`, `settings-catalog.test.ts`, `pricing.parity.test.ts`.

## Real gaps (in priority order)

### 1. Settings written but never read at runtime (biggest gap)

`rg` across the codebase confirms zero runtime consumers for these keys — the admin UI writes them, they clamp correctly, but nothing enforces them:

| Key | Should gate | Currently |
|---|---|---|
| `security.id_verification_threshold` | Block/require KYC on transactions above the NGN threshold | Not read anywhere |
| `risk.high_value_alert_ngn` | Fire admin alert / flag transaction on high-value orders | Not read anywhere |
| `security.session_timeout_minutes` | Force sign-out / refresh after idle period (admin sessions) | Not read anywhere |
| `security.two_factor_admin` | Require 2FA challenge for admin sign-in | Not read anywhere |

**Fix per key** (all use the existing `get_effective_settings` RPC + `loadEffectiveSettings` helper — no new plumbing):

- **`security.id_verification_threshold`**: in `create-transaction`, `cart-checkout`, `storefront-checkout`, `claim-offer`, after computing pricing, check `total_amount >= threshold`. If buyer lacks a verified `identity_submissions` row (status `approved`), return `identity_verification_required`. Client checkout screens surface a friendly gate + link to `/verify-identity`.
- **`risk.high_value_alert_ngn`**: after a transaction is created and paid, in `paystack-webhook`/`initiate-paystack-payment` verification path, if `total_amount >= threshold` insert an `admin_actions` row (`action_type='high_value_flag'`) and a `notifications` row targeted at admins. Admin dashboard already surfaces admin notifications.
- **`security.session_timeout_minutes`**: read once at app bootstrap via `pricing-config`-style public endpoint (extend it to expose non-secret security keys, or add a small `public-security-config` fn). Wire into an idle-timer hook (`useIdleTimeout`) mounted inside `AdminLayout` only. On idle → `supabase.auth.signOut()` + toast.
- **`security.two_factor_admin`**: read at admin sign-in success in `AdminAuthGate` (or new hook). If `true` and the user has `admin` role, require the existing phone OTP flow (`phone_otp_codes`) before granting admin access; store a per-session flag in `sessionStorage` so it's not asked again mid-session.

### 2. Real audit history in `AdminSettings.tsx` (item 7)

Currently a button that toasts "Audit history will open when wired to admin_actions". Replace with a Sheet/Dialog that fetches:

```sql
select * from admin_actions
where action_type in ('update_setting','toggle_auto_release','update_timeout_rule')
order by created_at desc limit 100
```

Render rows with actor, key, old→new, scope, vendor (if any), reason. Add a small filter by key.

### 3. Vendor Overrides tab (item 6)

Add a third tab next to Platform/Vendor called **Overrides**. Backend already returns `override_counts` and `vendor_overrides`. Render:

- One row per `(vendor, key)` with current value, platform baseline, "Reset to platform" action (calls existing PUT with `null` value / DELETE row via new small backend action).
- Group by vendor with a search box.

### 4. Feature flag `settings.resolver_enabled` (item 10)

Add a boolean to `system_settings` (platform-only). In `_shared/settings-resolver.ts`, if the flag is `false`, `loadPricingConfig` / `loadEffectiveTimeoutHours` short-circuit to constants (`MAX_TOTAL_SERVICE_FEE_FALLBACK`, hardcoded 48h/72h). Provides an instant kill-switch without redeploy. Mirror on client for `useEffectivePricingConfig` (falls back to static `defaultPricingConfig`).

## Out of scope (confirmed)

- Auto-release automation — admin still triggers payouts manually via the payout button. `escrow.auto_release_enabled` remains an audited toggle + banner on `AdminPayouts.tsx` (already implemented); no runtime timer.

## Files touched

**Backend**
- `supabase/functions/create-transaction/index.ts`, `cart-checkout/index.ts`, `storefront-checkout/index.ts`, `claim-offer/index.ts` — enforce `id_verification_threshold`.
- `supabase/functions/initiate-paystack-payment/index.ts` (or `paystack-webhook`) — emit high-value flag/notification.
- `supabase/functions/_shared/settings-resolver.ts` — honor `settings.resolver_enabled`; add `loadSecurityConfig()` helper.
- `supabase/functions/pricing-config/index.ts` — extend to expose non-secret security keys (or new `public-config` fn).
- `supabase/functions/admin-system-settings/index.ts` — add "reset vendor override" action.

**Frontend**
- `src/pages/AdminSettings.tsx` — real audit history sheet, Overrides tab.
- `src/components/admin/AdminLayout.tsx` (or equivalent) — mount `useIdleTimeout` + 2FA gate.
- New `src/hooks/useIdleTimeout.ts`, `src/hooks/useAdmin2FAGate.ts`.
- `src/pages/StorefrontCheckout.tsx`, `src/pages/BuyerCart.tsx`, `src/pages/CartCheckoutReview.tsx`, `src/pages/SellerCreateTransaction.tsx` — surface `identity_verification_required` errors with CTA.
- `src/lib/pricing.ts` / `useEffectivePricingConfig` — respect resolver flag.

**Migration**
- Add `settings.resolver_enabled` seed row (platform scope, default `true`).

## Acceptance checks

- Setting ID threshold to ₦50,000 blocks a ₦60,000 checkout for an unverified buyer with a clear error.
- Setting high-value alert to ₦100,000 causes a ₦150,000 paid transaction to appear as an admin notification + `admin_actions` row.
- Setting admin session timeout to 5 min signs out an idle admin.
- Toggling `two_factor_admin=true` requires OTP on next admin sign-in.
- Toggling `settings.resolver_enabled=false` makes pricing/timeouts fall back to constants (verified by parity test).
- Audit history sheet shows real `admin_actions` rows.
- Overrides tab lists all vendor overrides with reset action.
