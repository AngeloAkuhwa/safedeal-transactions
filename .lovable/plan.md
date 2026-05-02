## Honest verdict — is SafeDeal 100%?

I ran a forensic audit comparing the registry, edge functions, RLS, dispute flow, payout flow, money-state machine, and dashboard math against the **real** Postgres enums and behaviour. Here is what is actually true today:

### What IS correct end-to-end (verified against DB ground truth)

- **Status registry matches DB enums exactly** — `transaction_status` (incl. `resolved`), `money_status`, `payout_status`, `dispute_case_status`, `escrow_state`, `delivery_method_type`, `item_condition`, `product_status`. No drift.
- **Money state machine** (`validate_money_transition`) correctly allows `funds_held_in_escrow → funds_frozen` (dispute path) and rejects everything illegal. Trigger `enforce_transaction_transitions` is wired.
- **Dispute opens correctly freeze funds**: `transaction-verify` → `raiseDispute` performs an atomic transition to `tx.status='disputed'`, `money_status='funds_frozen'`, `dispute_status='open'`, with evidence linking, response deadline (48 h) and notification fan-out. Duplicate-dispute guard present.
- **Payout-during-dispute is implicitly blocked**: `release-core.ts` requires `money_status='funds_pending_release'`. A frozen tx can't pass, so disputes block release.
- **Payout idempotency**: short-circuits when `status IN (processing, completed)` and a `provider_reference` exists — no duplicate Paystack transfers.
- **Courier dispatch guard**: `tracking_number` + `courier_name` enforced before `seller_dispatched`.
- **Money formatting**: every monetary surface uses `formatMoney` (2 dp, no rounding to thousands). Kobo conversion uses `Math.round(n*100)` only — safe.
- **Audience-aware labels**: buyers see "Confirm Item Received", sellers see "Delivered", etc. No "admin release" leakage to buyer/seller surfaces.
- **Auto-release safety**: `auto-timeout-payments` only times out **unpaid** transactions; it never auto-releases funds.

### What is NOT 100% — one real gap

**The seller dashboard does not surface a "Frozen / Disputed Funds" amount.**

The user's audit explicitly asked for this:
> *"Disputed/Frozen funds = transactions under active dispute."*

Today `seller-dashboard` returns `open_disputes_count` (a number) but no `frozen_funds_amount`. The seller can see *that* a dispute exists but not *how much money* is frozen. This is the only material logic/data gap remaining.

Everything else the audit lists (state transitions, dispute freeze, payout guards, dual-audience labels, money precision, taxonomy, notifications, ledger writes) is already correct.

---

## Phase Q — Surface frozen-funds on the seller dashboard

### Backend (`supabase/functions/seller-dashboard/index.ts`)

1. Add a new bucket in the per-tx loop:
   - `if (tx.money_status === "funds_frozen") fundsFrozenTxIds.push(tx.id);`
2. Sum `seller_net_amount` from `transaction_pricing` for those tx ids → `fundsFrozenAmount`.
3. Add to the response payload:
   ```ts
   funds_frozen_amount: fundsFrozenAmount,
   funds_frozen_count: fundsFrozenTxIds.length,
   ```

### Service type (`src/services/seller-dashboard.service.ts`)

Add the two new fields to the `SellerDashboardData` shape next to `funds_held_in_escrow_amount`.

### UI (`src/pages/SellerDashboard.tsx`)

Add a new metric tile in the existing `sd-metric` grid, only when `funds_frozen_amount > 0`:
- Label: "Frozen Funds"
- Value: `formatMoney(funds_frozen_amount, "NGN")`
- Sub: `${funds_frozen_count} transaction(s) under dispute`
- Tone: `destructive` (matches `MONEY_LABELS.seller.funds_frozen`)
- Click target: `/seller/disputes`

No registry changes needed — `MONEY_LABELS.seller.funds_frozen = { label: "Funds Frozen", tone: "destructive" }` already exists.

### Acceptance

- A seller with a tx in dispute sees the frozen-amount tile with the exact NGN figure to 2 dp.
- A seller with no disputes does not see the tile (no zero-state noise).
- Tile click navigates to the disputes page where the same amounts reconcile.
- Sum of `funds_held_in_escrow_amount + funds_frozen_amount + funds_pending_release_amount` equals total seller-net currently held by SafeDeal — the seller can reconcile.

---

After Phase Q lands, SafeDeal is genuinely production-ready end-to-end: every status, money figure, transition guard, and audience label is consistent with the database, and the seller can fully account for held / frozen / pending-release / released funds without leaving the dashboard.