# Multi-Tenant Settings — Current Status & Finish Plan

## Honest status: **~85% complete**, not 100%

### ✅ Newly completed this turn (Correctness gaps closed)

1. **`_shared/safedeal-money-policy.ts`** — cap re-derivation removed. `snapshotFromPersisted` now trusts the persisted `is_total_service_fee_capped` flag written at snapshot time (so vendors with custom caps aren't wrongly re-evaluated against the global constant).
2. **`admin-escrow-alert-settings`** — extended to accept `?vendor_id=<uuid>` on GET/PUT plus a new DELETE to clear a vendor override. Returns platform baseline + effective vendor value, writes `admin_actions` audit rows, CORS updated for DELETE.
3. **Verification/fulfillment timeouts** — new `loadEffectiveTimeoutHours(vendorId, ruleType, fallback)` helper in `_shared/settings-resolver.ts` (uses `get_effective_timeout` RPC). Wired into `create-transaction`, `storefront-checkout`, `cart-checkout`, `claim-offer` as the fallback when the product/body doesn't override.

Everything from the earlier "Fully done" list still stands.

### ❌ Still outstanding (Phases B, C, D)

**Phase B — Admin completeness**
4. `src/lib/settings-catalog.ts` manifest (keys, types, min/max, help text) — not created.
5. Bounds clamping in `admin-system-settings` PUT — only `is_overridable=false` gate exists; no min/max enforcement.
6. "Vendor overrides" admin tab listing which vendors override which keys (backend already returns `override_counts`).
7. Real audit history card in `AdminSettings.tsx` (currently example rows) → read `admin_actions` where `action_type IN ('update_setting','update_escrow_alerts','clear_escrow_alerts_override')`.
8. "Overridden by vendor" badge on all overridable fields when viewing a vendor scope (currently only base fee / cap / refund policy).

**Phase C — Vendor visibility**
9. "Your effective settings" read-only panel on `SellerProfileSettings.tsx`.

**Phase D — Safety net**
10. Feature flag `settings.resolver_enabled` for one-flip rollback to constants.
11. Unit tests for `computePricing` under platform-only / vendor-override / clamped-override configs.
12. Snapshot parity test proving `create-transaction` produces identical output when no overrides exist.

### Out of scope (this phase)
Auto-release / cron release-core / retry-payout — payouts are admin-triggered.

## Proposed next step

Pick one — I'll execute:

- **B — Admin polish** (items 4–8): catalog manifest + clamping + overrides tab + real audit history + full badges. Highest daily-use value.
- **C — Vendor visibility** (item 9): sellers see effective settings.
- **D — Safety net** (items 10–12): flag + tests.
- **All of B+C+D**: finish to 100%.

Which do you want next?
