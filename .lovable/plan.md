## Fix Plan — Admin System Settings

### Issue 1: "Failed to fetch" when selecting a vendor
The `admin-system-settings` edge function file exists at `supabase/functions/admin-system-settings/index.ts` but is not registered/deployed, so every `GET /functions/v1/admin-system-settings` from the page fails with a network error (visible in the network log). Same for `pricing-config`.

**Fix:**
- Deploy the two missing edge functions (`admin-system-settings`, `pricing-config`) so the endpoints resolve.
- Verify with a follow-up GET that the payload returns `settings`, `timeouts`, `override_counts`, `vendor_id`.

### Issue 2: Non-overridable keys must be read-only in Vendor scope
The DB already marks these keys `is_overridable = false` (platform-only, cannot be varied per vendor):
- `pricing.min_platform_fee_ngn` (base protection floor)
- `pricing.max_total_service_fee_ngn` (buyer-friendly cap)
- `fees.refund_policy`

The GET response already returns `is_overridable` per row, but `AdminSettings.tsx` currently renders every input the same in both scopes.

**Fix in `src/pages/AdminSettings.tsx`:**
1. Build an `overridableMap: Record<string, boolean>` from the loaded platform settings and pass it into the section components.
2. Add a small helper `isLocked(key) = scope === "vendor" && overridableMap[key] === false`.
3. For each field bound to a non-overridable key (base protection fee, service-fee cap, refund policy dropdown, and any timeout rule marked non-overridable):
   - Apply `disabled` / `readOnly` on the input and dim styling (`opacity-60 cursor-not-allowed`).
   - Show a small "Platform-only" chip next to the label so it's clear why.
   - Skip these keys from the "dirty" diff and from the PUT payload while in vendor scope.
4. Keep the same fields fully editable when `scope === "platform"`.
5. Client-side guard mirrors the server: `admin-system-settings` already rejects vendor writes to non-overridable keys with `403 key_not_overridable` — the UI change just prevents users from ever hitting that error.

### Out of scope
No schema changes, no changes to the resolver/pricing engine, no changes to write paths.
