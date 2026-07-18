
## 1. Why "Active Rules" still shows a $ symbol

The pill next to the Fee Configuration header uses the Lucide `DollarSign` icon:

```tsx
// src/pages/AdminSettings.tsx  (~L479–482)
<div className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 ...">
  <DollarSign className="h-3 w-3 text-emerald-400" />
  <span className="...">Active Rules</span>
</div>
```

It is an icon, not a currency prefix — that is why the earlier `$ → ₦` pass missed it. The plan is to swap `DollarSign` for `Coins` (already imported), so the badge reads as "Active Rules" with a neutral coins glyph consistent with our NGN system. No other `$` remains on the page — I re-grepped and the currency prefixes on High-Value Alert and ID Verification Threshold are already `₦`.

While in that area, the Fee Configuration footer still shows a hardcoded `Last modified: 2 hours ago by Admin User` line. That is dead placeholder text; I will remove it since we already render real audit history at the bottom of the page.

### Files touched
- `src/pages/AdminSettings.tsx` — swap `DollarSign` icon → `Coins` on the "Active Rules" pill; delete the hardcoded "Last modified …" line.

## 2. Honest re-audit of the 12-point checklist

Since that audit was written, several items landed in later turns. Here is the current status, item-by-item:

| # | Item | Status |
|---|---|---|
| 1 | `_shared/safedeal-money-policy.ts` — dynamic cap / config-aware version | ✅ Done. `computePricingModelVersion(config)` replaces the constant; consumers pass vendor config. |
| 2 | `admin-escrow-alert-settings` supports `?vendor_id=` | ✅ Done. |
| 3 | Timeout rules resolve via `loadEffectiveTimeoutHours(vendor_id, rule_type)` in `create-transaction`, `cart-checkout`, `storefront-checkout`, `claim-offer` | ✅ Done. |
| 4 | Settings catalog manifest (`src/lib/settings-catalog.ts` + shared server twin) | ✅ Done. Includes `risk.high_value_alert_ngn` and vendor-scope permissions. |
| 5 | Bounds clamping in PUT | ✅ Done via catalog `clamp()` in `admin-system-settings`. |
| 6 | "Vendor overrides" admin **tab** with drill-down | ⚠️ **Partial.** A summary section renders `override_counts` and the top 20 rows, but not a full tab with per-vendor drill-down and jump-to-vendor-scope links. |
| 7 | Real audit history in `AdminSettings.tsx` | ✅ Done — real `admin_actions` rows including new `toggle_auto_release` events. |
| 8 | "Overridden by vendor" badges on every overridable field | ✅ Done — badges on session timeout, KYC, 2FA, notifications, risk thresholds, refund policy, auto-release, and timeout rows. |
| 9 | Vendor-side "Your effective settings" panel on `SellerProfileSettings.tsx` | ✅ Done (`EffectiveSettingsPanel.tsx` wired). |
| 10 | Feature flag (`settings.resolver_enabled`) | ✅ Done — `SETTINGS_RESOLVER_ENABLED` (server) and `VITE_SETTINGS_RESOLVER_ENABLED` (client) with fallback to defaults. |
| 11 | Pricing tests (defaults / caps / overrides / clamped) | ✅ Done — `src/lib/__tests__/pricing.test.ts` and `settings-catalog.test.ts`. |
| 12 | Server snapshot parity test (no-override vs default-matching override) | ✅ Done — `supabase/functions/_shared/__tests__/pricing.parity.test.ts`. |

**Net status: ~95% complete.** The only remaining checklist item is #6 (a dedicated "Vendor Overrides" tab with per-vendor drill-down and quick "switch to vendor scope" links).

## 3. Scope of this plan

Only the two UI polish fixes in section 1 will be executed now:
1. Icon swap on the Active Rules badge.
2. Delete the hardcoded "Last modified" placeholder in Fee Configuration.

I will not open the vendor-overrides drill-down tab in this plan — call it out separately if you want it built next.
