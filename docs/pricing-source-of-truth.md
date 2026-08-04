# Pricing — one source of truth for fee rates

## The four layers

| Layer | Role | Notes |
|---|---|---|
| `system_settings` (`pricing.*` rows) | **Source of truth.** The only place a rate is *defined*. | `pricing.tier_rates`, `pricing.min_platform_fee_ngn`, `pricing.max_total_service_fee_ngn` |
| Admin Settings page (`/admin/settings` → `admin-system-settings`) | **Only human write path.** Requires `platform_configuration.configure` plus `financial_controls.configure` for any `pricing.*` key. Reason string mandatory. | Direct DB writes are for the vendor-override path below and are still versioned. |
| `settings-resolver.ts` (`loadPricingConfig`) | **Resolution.** vendor-scope row wins over platform row; validated against the economic invariant before it can reach charging. | Client previews read the same resolution through `pricing-config` + `useEffectivePricingConfig`. |
| `transaction_pricing` | **Immutable historical record** of what a specific transaction was actually charged. Never recomputed. | Snapshot-first: release/payout read the snapshot, not the live rate card. |

Rate literals exist in exactly two mirrored places, both marked disaster-recovery-only:
`src/lib/pricing.ts → FALLBACK_PRICING_CONFIG` and
`supabase/functions/_shared/pricing.ts → DEFAULT_PRICING_CONFIG` (re-exported by the resolver).
They must equal the seeded platform rows; `src/__tests__/pricing-fallback-parity.contract.test.ts`
fails if they drift. The Deno/Vite boundary is why they are not a single module.

## Economic invariant

Implemented in `src/lib/pricing-invariant.ts` and its Deno mirror
`supabase/functions/_shared/pricing-invariant.ts`.

> For **every** item amount, `platform_fee_amount >= MIN_PLATFORM_MARGIN_NGN` (₦100) —
> equivalently `service_fee_amount >= paystack_fee + ₦100`.

Paystack's fee is a real cost SafeDeal pays; `platform_fee_amount` is what is left over.
₦100 mirrors Paystack's flat per-transaction component and is the hard economic floor.
The seeded ₦250 minimum platform fee is a *commercial* choice that sits above it and can be
renegotiated; ₦100 cannot.

Rates, floor and cap are coupled, so the check is a **sweep** over tier boundaries, the
₦2,500 Paystack flat-fee boundary and the cap-binding high-amount range (`buildSweep`).
A cap below the Paystack fee at high amounts, or a zero floor with a thin tier rate at low
amounts, are both caught even though each individual field looks legal.

Enforced twice:
- **Save-time** in `admin-system-settings` (PUT): the proposed values are merged over the
  currently effective ones and swept; a violation returns HTTP 400 with a message naming the
  failing amount range, surfaced verbatim in the settings UI toast.
- **Load-time** in `loadPricingConfig`: a stored config that violates the invariant is
  discarded, charging falls back to `DEFAULT_PRICING_CONFIG`, and a deduped
  `raise_system_alert` (`pricing_invariant_violation:<vendor_id>`) is raised.

## Versioning model (effective-dated rates)

`system_settings` rows are still updated in place — current reads and
`get_effective_settings` semantics are **unchanged**. Superseded values are retained in an
append-only side table, `public.system_settings_history`, written by the
`track_pricing_setting_version()` trigger for pricing keys only.

Each version records: `old_value`, `new_value`, `changed_by`, `changed_at`,
`effective_from` (`clock_timestamp()`), `scope`, `vendor_id`, `version`, and `reason`.
The reason is stamped right after the write by `annotate_setting_version_reason()`
(the only permitted update, and only while `reason IS NULL`); every other update and all
deletes are blocked by `system_settings_history_append_only()`.

Existing rows were backfilled as version 1 with their original `updated_at`.

Why a history table rather than `effective_from`/`effective_to` columns on
`system_settings`: the columns approach would force every current-value read (including
`get_effective_settings`, the resolver and the admin GET) to add a temporal predicate — a
semantic change to the charging path. The side table changes nothing about how the current
value is read.

Point-in-time read:

```sql
SELECT * FROM public.get_pricing_settings_at(<vendor_uuid_or_null>, '2026-07-25T00:00:00Z');
-- returns setting_key, setting_value, scope, version, effective_from
-- vendor-scope version wins over platform version at that instant
```

## Adding a vendor-scope override today (direct insert)

There is deliberately **no admin UI** for vendor overrides yet (see below). To create one,
insert the row directly. All three fields should be set together:

```sql
INSERT INTO public.system_settings (setting_key, setting_value, scope, vendor_id, updated_by)
VALUES
  ('pricing.tier_rates',
   '[{"upto":250000,"rate":0.035},{"upto":null,"rate":0.03}]'::jsonb,
   'vendor', '<seller_profile_uuid>', '<admin_profile_uuid>'),
  ('pricing.min_platform_fee_ngn', to_jsonb(250), 'vendor', '<seller_profile_uuid>', '<admin_profile_uuid>'),
  ('pricing.max_total_service_fee_ngn', to_jsonb(2500), 'vendor', '<seller_profile_uuid>', '<admin_profile_uuid>');

-- Required: attach the negotiation reason to each new version row.
SELECT public.annotate_setting_version_reason('pricing.tier_rates', 'vendor', '<seller_profile_uuid>',
  'Negotiated rate card — contract ref XXX, approved by <name> on <date>');
-- repeat for the other two keys
```

Expectations for a direct insert:
- `updated_by` must be the real admin profile id — it becomes `changed_by` in the version row.
- A reason must be annotated on every version created; an unexplained rate change is an audit defect.
- The resulting card must satisfy the economic invariant. The resolver will reject it at load
  time and alert if it does not — verify before relying on it.
- Note `pricing.tier_rates` and `pricing.min_platform_fee_ngn` are catalogued as
  platform-writable only for the *UI* path; a vendor-scope row inserted directly is still
  resolved and charged.

## Why the vendor-override admin UI is deferred

There is currently one seller and no live payments. Building the override UI now would be
speculative surface area on the money path. It will be built when a genuinely negotiated
seller exists.

When that day comes, the UI must:
- Edit **all three fields together** (rates + floor + cap), never rate-only — a floor or cap
  left at the platform value can mask a negotiated rate entirely (e.g. the ₦2,500 cap makes
  any tier rate irrelevant above ~₦65k).
- Show the resolved card (vendor over platform) and the platform card side by side.
- Run the economic invariant client-side before enabling save, and surface the server message.
- Require a reason and write it into `system_settings_history` via the same annotate path.
- Offer a "revert to platform" action that deletes the vendor rows (which appends a version
  entry, keeping the history complete).
