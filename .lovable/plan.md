# Close-out Plan — Linked Records + Party-Facing Labels

Two remaining items to finish the dispute resolution flow.

---

## 1. Linked Records expansion (admin)

**File:** `supabase/functions/admin-transaction-detail/index.ts`

The function already loads `dispute_outcomes`, `refunds`, and `escrow_ledger_entries`. We need to:

a. **Add a new fetch** for `release_review_queue` rows tied to this transaction:
```ts
admin.from("release_review_queue")
  .select("id, status, queue_type, amount, currency_code, created_at, reviewed_at")
  .eq("transaction_id", txId)
  .order("created_at", { ascending: false })
  .limit(5)
```

b. **Extend the `linkedRecords` builder** (lines ~610–645) to push, when present:
- `dispute_outcome` — label "Dispute Outcome", subtitle = humanized `outcome_type`, status = `outcome_type`, amount = `refund_amount + release_amount`, route `null`.
- `refund` — for the latest active refund row: label "Refund Record", subtitle = reason or `created_at`, status, amount, currency.
- `release_queue` — for the latest pending review row: label "Release Review", subtitle = `queue_type`, status, amount, currency.
- `escrow_ledger` — single summary entry: label "Escrow Ledger", subtitle = "{N} entries", status = latest `entry_type`, route `null`. (Detailed list already lives under `escrow.ledger`.)

Keep existing buyer/seller/payment/escrow/payout/dispute/product entries unchanged. Order: parties → payment → escrow → escrow_ledger → payout → release_queue → refund → dispute → dispute_outcome → product.

c. **Type update** — add the new optional record types to `AdminTxLinkedRecord["type"]` in `src/services/admin-transaction-detail.service.ts` (currently typed `string`, no change needed) and ensure `AdminTransactionDetail.tsx`'s Linked Records renderer has icon/label fallback for the new `type` values.

**No DB migration. No business logic change.**

---

## 2. Party-facing label coverage

The new outcome types (`dismissed_seller_favor`, `dismissed_buyer_favor`, `partial_refund_release`) and resolved-dispute display rules currently fall through to generic copy on buyer/seller surfaces.

### 2a. Route party badges through `deriveDisputeDisplay`

**Files:**
- `src/components/disputes/DisputeStatusBadge.tsx`
- `src/components/disputes/DisputeMoneyStatusBadge.tsx`

Add optional props `outcome?: DisputeOutcomeInput | null`, `moneyStatus?: string | null`, `escrow?: { heldAmount, frozenAmount } | null`. When provided AND `disputeStatus === "resolved"`, call `deriveDisputeDisplay(...)` and render its `label` + `tone` (mapping `"info" | "warning" | "danger" | "success" | "neutral"` → existing `TONE_CLASSNAMES` keys). Otherwise fall back to current `resolveDisputeLabel` / `resolveDisputeMoneyLabel` behavior (zero regressions for unresolved disputes).

Add a tone→Tone map inside each badge (`danger → destructive`, `neutral → muted`, others identity).

### 2b. New outcome labels in `DisputeResolutionSection`

**File:** `src/components/disputes/DisputeResolutionSection.tsx`

Extend `OUTCOME_LABELS` with:
```ts
dismissed_seller_favor: { label: "Dismissed — Seller Favor", className: "bg-warning/15 text-warning border-warning/30" }
dismissed_buyer_favor:  { label: "Dismissed — Buyer Favor",  className: "bg-success/15 text-success border-success/30" }
partial_refund_release: { label: "Partial Resolution",       className: "bg-primary/15 text-primary border-primary/30" }
```

For `partial_refund_release`, the existing two amount blocks (refund + release) already render correctly — no structural change needed beyond confirming both are shown side-by-side with NGN 2dp via `formatMoney(..., currencyCode)`.

For `dismissed_seller_favor` show only the release amount block; for `dismissed_buyer_favor` only the refund amount.

### 2c. Touch-ups in `status-labels.ts` (optional, for completeness)

Add a small registry so any other consumer can resolve outcome copy without re-importing the section:
```ts
export const DISPUTE_OUTCOME_LABELS: Record<string, LabelEntry> = {
  refund_buyer:                 { label: "Refund to Buyer",            tone: "success" },
  release_funds_to_seller:      { label: "Released to Seller",         tone: "info" },
  partial_refund_release:       { label: "Partial Resolution",         tone: "info" },
  dismissed_seller_favor:       { label: "Dismissed — Seller Favor",   tone: "warning" },
  dismissed_buyer_favor:        { label: "Dismissed — Buyer Favor",    tone: "success" },
  close_case_without_resolution:{ label: "Closed — No Resolution",     tone: "muted" },
};
export function resolveDisputeOutcomeLabel(t: string | null | undefined): LabelEntry { ... }
```
Used by `DisputeResolutionSection` (replaces the inline map) and any future buyer/seller dispute card.

---

## 3. Tests

Extend `src/lib/__tests__/dispute-display-status.test.ts` with two cases (if not already covered): party-facing badge derivation for `dismissed_seller_favor` → "Awaiting Release" and `dismissed_buyer_favor` → "Refund Pending". Add a render snapshot or shallow assertion that `DisputeResolutionSection` renders the new three outcome labels and shows the partial split with NGN 2dp.

---

## Files changed

- `supabase/functions/admin-transaction-detail/index.ts` (fetch + linkedRecords push)
- `src/pages/AdminTransactionDetail.tsx` (icon/label fallback for new types in Linked Records section)
- `src/components/disputes/DisputeStatusBadge.tsx`
- `src/components/disputes/DisputeMoneyStatusBadge.tsx`
- `src/components/disputes/DisputeResolutionSection.tsx`
- `src/lib/status-labels.ts` (new outcome registry + resolver)
- `src/lib/__tests__/dispute-display-status.test.ts` (new cases)

## Acceptance

- Admin Linked Records panel shows up to 10 record types when applicable: buyer, seller, payment, escrow, escrow_ledger, payout, release_queue, refund, dispute, dispute_outcome, product.
- Buyer and seller dispute screens never display "In Dispute" once `disputes.status = resolved` — they show derived labels (Awaiting Release / Refund Pending / Partially Resolved / Manual Action Required / Funds Held in Escrow).
- `DisputeResolutionSection` renders human-readable headers for all six outcome types; partial outcome shows both amounts in NGN with 2 decimals.
- No backend logic, no migration, no Paystack call introduced.
