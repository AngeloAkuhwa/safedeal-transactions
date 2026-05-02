# Phase O — Real production-readiness fixes

## Honest answer: Not 100%. A fresh audit just found real production bugs that previous phases missed.

The earlier "ready to deploy" claim was wrong. A targeted re-audit just surfaced concrete defects that match the exact failure modes the user asked us to catch: drifting taxonomies, hardcoded label maps that disagree with the database, and a money helper bypassing `formatMoney`.

---

## Real bugs found (with ground truth from DB enums)

### 1. Delivery method labels disagree with the DB enum

**Database `delivery_method_type` enum:** `courier | pickup | meetup | hand_delivery` (4 values).

What the code actually ships:

| File | Keys used | Match DB? |
|---|---|---|
| `SellerTransactionDetail.tsx` | `standard_shipping`, `express_shipping`, `local_pickup`, `digital_delivery`, `courier` | only `courier` |
| `SellerTransactionShare.tsx` | (same as above) | only `courier` |
| `StorefrontCheckout.tsx` | `pickup`, `delivery`, `courier_shipping`, `digital`, `hand_delivery`, `meetup` | only 3 of 4 |
| `PublicProductDetail.tsx` | (same as Storefront) | only 3 of 4 |

**Real impact:** A transaction with `delivery_method = "meetup"` (a valid DB value) shows the raw enum string `"meetup"` to the seller on the transaction detail page, because the local `deliveryLabels` map has no entry for it. Same for `pickup` and `hand_delivery`.

### 2. Item-condition labels also disagree with the DB enum

**Database `item_condition` enum:** `brand_new | like_new | excellent | good | fair | used` (6 values).

| File | Keys used | Bogus keys (not in DB) | Missing real values |
|---|---|---|---|
| `SellerTransactionDetail.tsx` | `new`, `like_new`, `good`, `fair`, `refurbished` | `new`, `refurbished` | `brand_new`, `excellent`, `used` |
| `SellerTransactionShare.tsx` | (same) | (same) | (same) |
| `PublicProductDetail.tsx` | `brand_new`, `like_new`, `used_good`, `used_fair`, `refurbished` | `used_good`, `used_fair`, `refurbished` | `excellent`, `good`, `fair`, `used` |

**Real impact:** Buyer sees "Brand New" on the product page; the same item on the seller's transaction detail page renders the raw `brand_new` token because the seller-side map doesn't know that key. Plus three valid DB values render as raw enum strings everywhere.

### 3. `SellerAnalytics.tsx` bypasses `formatMoney`
Has its own local `NGN()` helper. All money on the analytics page (Awaiting Release, summary cards, CSV export rows) goes through it instead of the central `formatMoney` from `@/lib/format`.

### 4. Status registries exist but several consumers still inline their own maps
Phase M expanded `src/lib/status-labels.ts` to include `ESCROW_STATE_LABELS` and `PAYOUT_STATUS_LABELS`, but these consumers still ship their own duplicate maps:
- `src/pages/SellerPayouts.tsx` → inline payout status badge
- `src/components/seller-disputes/SellerPayoutImpactCard.tsx` → inline escrow + payout maps
- `src/components/seller-disputes/SellerDisputeTable.tsx` → inline money-impact map
- `src/components/seller-disputes/ExportDisputesDialog.tsx` → inline status + money-impact maps

When a new escrow/payout state is added, these maps will silently render raw tokens.

---

## Fix plan

### O1 — Add taxonomy registry (single source of truth)

Add to `src/lib/status-labels.ts`:

```ts
export const DELIVERY_METHOD_LABELS: Record<DeliveryMethodType, string> = {
  courier: "Courier / Shipping",
  pickup: "Pickup",
  meetup: "Meetup",
  hand_delivery: "Hand Delivery",
};

export const ITEM_CONDITION_LABELS: Record<ItemCondition, string> = {
  brand_new: "Brand New",
  like_new: "Like New",
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  used: "Used",
};

export function resolveDeliveryMethod(value: string | null | undefined): string { ... }
export function resolveItemCondition(value: string | null | undefined): string { ... }
```

Both resolvers fall back to a `formatLabel(token)` (replace `_` with space + Title Case) so an unknown future enum value never renders as raw `snake_case`.

### O2 — Refactor every consumer to use the registry

Delete the inline maps in:
- `src/pages/SellerTransactionDetail.tsx`
- `src/pages/SellerTransactionShare.tsx`
- `src/pages/StorefrontCheckout.tsx`
- `src/pages/PublicProductDetail.tsx`

Replace each call site with `resolveDeliveryMethod(...)` / `resolveItemCondition(...)`.

### O3 — Refactor seller-disputes + payouts to the central registry
- `SellerPayouts.tsx` `PayoutStatusBadge` → use `PAYOUT_STATUS_LABELS` + `TONE_CLASSNAMES`
- `SellerPayoutImpactCard.tsx` → use `ESCROW_STATE_LABELS` + `PAYOUT_STATUS_LABELS`
- `SellerDisputeTable.tsx` `moneyImpactConfig` → use the dispute-money labels added in Phase M
- `ExportDisputesDialog.tsx` → use the central resolvers (CSV export must match UI)

### O4 — Remove `NGN()` helper from `SellerAnalytics.tsx`
Replace every call site with `formatMoney(value, currency)`. Update the CSV export rows to use `formatMoney` as well so the exported file matches the on-screen totals.

### O5 — Final audit

Run `rg` to confirm:
- Zero inline `Record<string, string>` maps for delivery methods, item conditions, payout status, or escrow state outside `status-labels.ts`
- Zero local `NGN()` / `naira()` / hand-rolled currency helpers
- Every DB enum value has a matching label entry

---

## What is NOT in scope

Things I verified are already correct and should not be touched:
- Courier dispatch enforcement (tracking number + courier name required before `seller_dispatched`) — already enforced in `DispatchForm` + `SellerUpdateDelivery`.
- State machine, escrow ledger, dispute freeze, payout auto-release — already wired through edge functions in earlier phases.
- Money formatting on all surfaces touched in Phases L–N (verified clean).
- Admin terminology leakage on user surfaces (verified clean — only matches are inside `/admin/**` routes, which is correct).
- `actionLabels` / `statusStyle` maps that map status → CTA text or status → CSS class only (these are presentational, not label drift).

---

## After Phase O

After this phase, every taxonomy value (delivery method, item condition, transaction status, escrow state, payout status, dispute status, verification status, product status, product visibility) is resolved through `src/lib/status-labels.ts`, and every money value goes through `formatMoney`. A buyer and a seller looking at the same transaction will see the same words for the same DB value, on every screen. That is the actual definition of production-ready against this audit.

Approve to apply Phase O.
