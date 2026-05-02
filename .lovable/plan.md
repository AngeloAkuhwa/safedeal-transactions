# Phase K — Final Production Polish

## Why this phase exists

Phase J shipped `src/lib/format.ts` and `src/lib/status-labels.ts`, and the money-formatter sweep is genuinely 100% — `rg "Intl.NumberFormat"` returns zero hits outside `format.ts`. **However, the status-label registry I built in Phase J is barely wired in.** A direct grep across the codebase shows:

- `audience="buyer"` is used in **zero** places. Every badge defaults to seller voice.
- **9 inline status-label maps** still drift across pages (buyer detail, buyer tracking, buyer verify, seller detail, seller recent activity, transaction filters, in-transit block, export preview, and seller analytics).
- `DisputeMoneyStatusBadge` is a separate component with its own hardcoded map ("Releasing", "Funds Released") that doesn't read from the registry.
- `TransactionTable` (used by `BuyerTransactions`) doesn't accept an `audience` prop, so the buyer's main transactions list shows seller-voice status.
- Buyer KPI tiles in `MetricsCards` are not deep-linked to filtered list views — Phase J acceptance #6 was checked off but not actually shipped.
- The money-status filter dropdown shows raw "Funds Releasing" instead of "Payment Processing".

This phase finishes Phase J by *actually adopting* what was built. No new tokens, no new helpers — just enforcement and cleanup.

---

## K1. Wire `audience` into every badge call site

**Components to update (accept and forward `audience`):**

- `src/components/transactions/TransactionTable.tsx` — add `audience?: Audience` prop, default `"seller"`, forward to `TransactionStatusBadge`.
- `src/components/transactions/TransactionStatusBadge.tsx` — already supports `audience` via the registry; verify default behavior unchanged.
- `src/components/transactions/MoneyStatusBadge.tsx` — same.
- `src/components/disputes/DisputeMoneyStatusBadge.tsx` — **delete the local `moneyConfig` map**, switch to `resolveMoneyLabel(status, audience)`, accept new `audience` prop (default `"buyer"` since it's currently buyer-only).

**Buyer call sites that must pass `audience="buyer"`:**

- `src/pages/BuyerTransactions.tsx` → `<TransactionTable transactions={…} audience="buyer" />`
- `src/pages/BuyerTransactionDetail.tsx` → all `<MoneyStatusBadge>` and `<TransactionStatusBadge>` usages
- `src/pages/BuyerTransactionTracking.tsx` → same
- `src/pages/BuyerTransactionVerify.tsx` → same
- `src/pages/BuyerTransactionReview.tsx` → same
- `src/pages/BuyerDisputeDetail.tsx` → `<DisputeMoneyStatusBadge audience="buyer" />`
- `src/components/disputes/BuyerDisputeList.tsx` → same

**Seller call sites stay default** (no change needed for `SellerTransactions`, `SellerTransactionDetail`, `SellerDisputeDetail`).

## K2. Delete inline status-label maps (root cause of drift)

Replace the local maps in each file with a single call to the registry helper:

```ts
// before:
const STATUS_MAP: Record<string, { label: string; … }> = { awaiting_buyer: { label: "Awaiting Buyer" … } … };
const cfg = STATUS_MAP[status];

// after:
import { resolveTransactionLabel, TONE_CLASSNAMES } from "@/lib/status-labels";
const { label, tone } = resolveTransactionLabel(status, audience);
const className = TONE_CLASSNAMES[tone];
```

Files to clean:

| File | Map to remove |
|---|---|
| `src/pages/BuyerTransactionDetail.tsx` | local `txStatusConfig` (line 62+) |
| `src/pages/BuyerTransactionTracking.tsx` | local `txStatusConfig` (line 46+) |
| `src/pages/BuyerTransactionVerify.tsx` | local `STATUS_LABELS` (line 27) |
| `src/pages/BuyerTransactionReview.tsx` | local status copy block |
| `src/pages/SellerTransactionDetail.tsx` | local `txStatusConfig` (line 36+) |
| `src/components/seller/SellerRecentActivity.tsx` | local `txStatusConfig` (line 19+) |
| `src/components/seller/ExportPreviewDialog.tsx` | local `STATUS_LABELS` (line 28+) — used in CSV header rendering, route through registry with `audience="seller"` |
| `src/components/transactions/InTransitBlock.tsx` | inline label-when conditions for `delivered_awaiting_verification` |
| `src/pages/SellerAnalytics.tsx` | inline status display strings |

`SellerUpdateDelivery.tsx` and `TransactionConfirmationProgress.tsx` use status strings as **timeline step keys**, not user-facing labels for the same DB value — leave the keys alone, but confirm the displayed label string is registry-sourced.

## K3. Fix the money-status filter dropdown

`src/components/transactions/TransactionFilters.tsx` line 52 lists `{ value: "funds_releasing", label: "Funds Releasing" }`. That's the wrong copy. Replace the entire money-status options array with a generated list:

```ts
const MONEY_STATUS_OPTIONS: { value: MoneyStatus; label: string }[] = (
  Object.keys(MONEY_LABELS[audience]) as MoneyStatus[]
).map((value) => ({ value, label: MONEY_LABELS[audience][value].label }));
```

Add `audience` prop to `TransactionFilters` (default `"seller"`). Pass `audience="buyer"` from `BuyerTransactions.tsx` where it renders the filter.

## K4. Buyer KPI tiles deep-link to filtered lists (Phase J acceptance #6 — not actually shipped)

`src/components/dashboard/MetricsCards.tsx` currently renders 4 tiles as static cards. Wrap each in `<Link to="…">` so clicking pre-applies the matching filter on `/buyer/transactions` or `/buyer/disputes`:

| Tile | Target |
|---|---|
| Active Purchases | `/buyer/transactions?status=active` |
| Awaiting Delivery | `/buyer/transactions?status=in_fulfillment` |
| Awaiting Verification | `/buyer/transactions?status=delivered_awaiting_verification` |
| Open Disputes | `/buyer/disputes?status=open` |

`BuyerTransactions` and `BuyerDisputes` already read `?status=` from the URL — verify and wire the chip toggle to honor the initial param on mount.

## K5. DisputeMoneyStatusBadge — buyer-correct copy

Currently prints "Releasing" and "Funds Released". For the buyer audience these should be "Payment Processing" and "Released to Seller" (per the J3 mapping table). The fix is automatic once K1's switch to `resolveMoneyLabel(status, "buyer")` lands.

Also extend the registry's `MONEY_LABELS.buyer` with the dispute-only states (`refund_pending`, `refund_issued`) — they exist in the seller dict but were copy-pasted; no change needed if already present (verify).

## K6. Verify defaults and prevent future drift

- Add a JSDoc note on `MoneyStatusBadge`/`TransactionStatusBadge` props: "If rendering for a buyer surface, pass `audience='buyer'`. Default is `'seller'` for backwards compatibility."
- Add a one-line comment to `src/lib/status-labels.ts` explaining the registry is the **single source of truth** and inline maps are forbidden.
- (No ESLint rule — too noisy; the comment + small surface area is enough.)

## K7. Sweep at 1246×890

After K1–K6 land, click through:

1. `/buyer/transactions` — every row's status chip reads buyer voice ("Confirm Item Received", not "Delivered").
2. `/buyer/transactions/:id` — header status reads buyer voice; money badge reads "Payment Secured" not "Funds Held".
3. `/buyer/transactions/:id/verify` — page title reads "Confirm Item Received".
4. `/buyer/disputes/:id` — money badge reads "Payment Processing" not "Releasing".
5. `/dashboard` — clicking a KPI tile lands on the right filtered list.
6. `/seller/transactions` — unchanged seller voice ("Awaiting Your Confirmation" etc.) still works.
7. Filter dropdown on `/seller/transactions` and `/buyer/transactions` shows audience-correct copy.

---

## Out of scope

- Backend / RLS / RPC changes — verified intact during the prior audit.
- New design tokens — Phases G/H/I shipped them; reusing.
- New helper files — `format.ts` and `status-labels.ts` already exist.
- Storefront / marketplace product browsing surfaces.

## Acceptance

1. `rg "audience=\"buyer\"" src` returns hits for at minimum: `BuyerTransactions`, `BuyerTransactionDetail`, `BuyerTransactionTracking`, `BuyerTransactionVerify`, `BuyerDisputeDetail`, `BuyerDisputeList`.
2. `rg -nE "(awaiting_buyer|payment_secured|seller_dispatched|delivered_awaiting_verification).*['\"][A-Z]" src/pages src/components` returns zero hits in user-facing label maps (only DB keys remain, never literal label strings).
3. The "Funds Releasing" filter option no longer appears anywhere; "Payment Processing" appears instead.
4. Clicking each of the 4 buyer KPI tiles navigates to the matching filtered list.
5. `DisputeMoneyStatusBadge` no longer contains a `moneyConfig` literal.
6. No regressions at 1246×890 — chips don't wrap, table doesn't overflow, KPI cards render the new labels without truncation.
7. Type-check clean; no new lint warnings.

## Files touched (summary)

- Modified (audience-prop forwarding + map deletion): `TransactionTable.tsx`, `TransactionFilters.tsx`, `DisputeMoneyStatusBadge.tsx`, `MetricsCards.tsx`, `InTransitBlock.tsx`, `ExportPreviewDialog.tsx`, `SellerRecentActivity.tsx`, `BuyerTransactions.tsx`, `BuyerTransactionDetail.tsx`, `BuyerTransactionTracking.tsx`, `BuyerTransactionVerify.tsx`, `BuyerTransactionReview.tsx`, `BuyerDisputeDetail.tsx`, `BuyerDisputeList.tsx`, `SellerTransactionDetail.tsx`, `SellerAnalytics.tsx`.
- Possibly extended: `src/lib/status-labels.ts` (only if dispute money states are missing from the buyer dict).
- No edge functions, no SQL, no new files.
