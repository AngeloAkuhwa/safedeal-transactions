
# Phase 7 — Legacy Pricing Column Removal (Final Phase)

This is the **last planned phase**. After Phase 7 the canonical pricing snapshot becomes the only source of truth and the legacy fallback code path is fully retired.

**Phases remaining after this one: 0.**

Phase 7 is gated by Phase 6's readiness banner: 100% `snapshot_complete` on the `v_pricing_snapshot_coverage` view, sustained for 30 days, with zero open `drift` rows. If the banner is not green, Phase 7 does not start.

---

## Goal

Remove the dual-write / dual-read legacy pricing surface (`transaction_pricing.processing_fee_amount`, `transaction_pricing.seller_net_amount`) and the `?? legacy` fallback expressions across edge functions, services, and types. Make the canonical columns (`payment_processing_fee_amount`, `seller_payout_amount`, `service_fee_amount`, `platform_fee_amount`, `buyer_total_amount`, `pricing_model_version`) `NOT NULL` going forward.

---

## Scope (in)

### 1. Stop writing legacy columns

Remove the `processing_fee_amount` and `seller_net_amount` keys from every `INSERT`/`UPDATE` payload into `transaction_pricing`:

- `supabase/functions/create-transaction/index.ts`
- `supabase/functions/cart-checkout/index.ts` (both insert + retry-update paths)
- `supabase/functions/storefront-checkout/index.ts`
- `supabase/functions/claim-offer/index.ts`

Verify there are no other writers via `rg "from\\(\"transaction_pricing\"\\)" supabase/functions`.

### 2. Stop reading legacy columns (remove `??` fallbacks)

Switch every read site to canonical-only. Drop the legacy column from the `.select(...)` list and the `?? p.seller_net_amount` / `?? processing_fee_amount` expressions:

- `admin-payouts-list`, `admin-payouts-detail`
- `admin-transactions-monitor`, `admin-transaction-detail`
- `transaction-verify`
- `seller-transactions`, `seller-transaction-detail`, `seller-dashboard`, `seller-analytics`, `seller-disputes`
- `src/services/transaction-detail.service.ts`, `src/services/seller-transaction-detail.service.ts`, `src/services/verification.service.ts`, `src/services/create-transaction.service.ts`

Any place that currently derives a value via `pr.paystack_fee_amount` because the pricing row was null becomes unreachable post-Phase 7; replace with a hard error (`throw new Error("missing pricing snapshot")`) — by definition this should never fire once gating is met.

### 3. Type cleanup

In `src/types/payment-flow.types.ts`:
- Remove the `@deprecated processing_fee_amount` and `seller_net_amount` optional fields from `PricingSnapshot`.
- Tighten `payment_processing_fee_amount` and `seller_payout_amount` from `number | null` to `number`.
- Drop the "locked legacy rows render —" comment block.

Mirror the tightening in the service-layer DTOs that re-export pricing fields.

### 4. Database migration — drop legacy columns + harden canonical

One migration, in this order:

1. **Pre-flight assertion** (DO block): `SELECT count(*) FROM transaction_pricing WHERE payment_processing_fee_amount IS NULL OR seller_payout_amount IS NULL OR buyer_total_amount IS NULL OR platform_fee_amount IS NULL OR pricing_model_version IS NULL` — `RAISE EXCEPTION` if non-zero. This makes the migration self-aborting if Phase 6 gating was bypassed.
2. `ALTER TABLE public.transaction_pricing ALTER COLUMN payment_processing_fee_amount SET NOT NULL`, same for `seller_payout_amount`, `buyer_total_amount`, `platform_fee_amount`, `service_fee_amount` (where applicable), `pricing_model_version`.
3. `ALTER TABLE public.transaction_pricing DROP COLUMN processing_fee_amount, DROP COLUMN seller_net_amount`.
4. Recreate any view that referenced the dropped columns (none expected — confirm via `pg_views` query during exploration).
5. Update `v_pricing_snapshot_coverage` / `v_pricing_snapshot_audit` to remove the `snapshot_legacy` branch — it becomes structurally impossible. Status enum collapses to `snapshot_complete | snapshot_missing`.

GRANTs and RLS untouched (no new tables).

### 5. Reconciliation job follow-up

In `supabase/functions/reconcile-escrow/index.ts`:
- Remove `snapshot_legacy` branch from the pricing audit pass.
- Update the admin screen's "Phase 7 readiness" banner copy to "Canonical snapshot enforced — Phase 7 complete." once the migration has shipped.
- Leave the hourly job in place; it now only flags `snapshot_missing` (which should be 0) and escrow `drift`.

### 6. Admin UI cleanup

`src/pages/AdminReconciliation.tsx`:
- Drop the `snapshot_legacy` KPI card.
- Replace the readiness banner with a static "Phase 7 complete" success state when coverage is 100% complete.

---

## Scope (out)

- No changes to fee math or `money-copy.ts`.
- No changes to `escrow_ledger_entries`, payouts, refunds, or Paystack integration.
- No buyer/seller-facing copy changes beyond the admin banner.
- No retroactive backfill — gating guarantees the data is already canonical.

---

## Technical details

**File counts (estimate)**: ~14 edge functions touched (delete-only edits), 4 service files, 1 types file, 1 migration, 1 admin page, 1 reconciliation job. Net code is **negative** — Phase 7 removes lines.

**Migration safety**: The pre-flight `RAISE EXCEPTION` makes the migration atomic. If a single row is non-canonical, the entire migration rolls back and no columns are dropped.

**Generated types**: `src/integrations/supabase/types.ts` will regenerate automatically after the migration and lose the legacy column keys — any remaining `?? row.seller_net_amount` reference will become a TypeScript error, which acts as a second safety net.

**Sequencing**: ship code changes (steps 1–3, 5, 6) **before** the migration (step 4). That way the running app stops reading/writing legacy columns first, then the migration drops them. If anything goes wrong, the migration aborts cleanly and the code is still valid because canonical columns are populated.

---

## Verification

1. Pre-migration: `SELECT count(*) FROM transaction_pricing WHERE payment_processing_fee_amount IS NULL` returns 0.
2. `tsc --noEmit` clean after type tightening — any missed legacy reference fails the build.
3. Edge-function deploy: every touched function deploys without errors.
4. Run `reconcile-escrow` manually with 24h lookback — expect 0 `snapshot_legacy`, 0 `snapshot_missing`, 0 `drift`.
5. Admin reconciliation page renders the "Phase 7 complete" banner.
6. Smoke a full buyer flow (create transaction → pay → seller confirm → payout) and verify the pricing snapshot rows are populated correctly and no UI shows `—` placeholders.

---

## Rollback

The migration is destructive (columns dropped). Two-stage rollback:

- **Code rollback only** (legacy columns still dropped): redeploy prior edge-function versions that read canonical-only. They still work because canonical is `NOT NULL`.
- **Full rollback** (re-add legacy columns): a follow-up migration re-adds `processing_fee_amount` and `seller_net_amount` as nullable, then a backfill `UPDATE transaction_pricing SET processing_fee_amount = payment_processing_fee_amount, seller_net_amount = seller_payout_amount`. This is recoverable but unnecessary — canonical data is a strict superset.

Recommendation: keep code rollback as the primary path; treat the migration as one-way.

---

## Risk

**Low-to-medium**, mitigated by gating:

- The Phase 6 readiness banner + the migration's `RAISE EXCEPTION` are belt-and-suspenders against premature execution.
- Risk of a missed `?? legacy` reference becoming a runtime null is eliminated by the `NOT NULL` constraint + TypeScript regeneration.
- No financial side-effects — Phase 7 is structural cleanup, not money math.

---

## Estimated work

- 1 migration (pre-flight, NOT NULL, DROP COLUMN, view update).
- ~14 edge functions edited (line removals only).
- 4 service/type files tightened.
- 1 admin page + 1 reconciliation job pruned.
- No new tables, no new routes, no new copy.

After Phase 7 ships and the reconciliation job runs cleanly for 7 days, the SafeDeal escrow stack is fully on the canonical pricing model with no legacy debt. **This concludes the multi-phase pricing migration.**
