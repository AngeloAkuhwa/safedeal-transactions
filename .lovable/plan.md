## What's happening

The 403 is correct behavior, not a bug. Gate 4 in `initiate-paystack-payment` caps each buyer at **5 active transactions** (status in `awaiting_payment`, `payment_secured`, `seller_preparing_delivery`, `seller_dispatched`, `delivered_awaiting_verification`, `disputed`). The buyer already has 5 active, so this new payment is refused.

Fix B already surfaces the real message in the modal subtitle — that's why "You've reached your active purchase limit (5)…" now shows. The remaining UX problem: the primary CTA is still **Retry Payment**, which will fail again with the exact same error every time. The buyer needs to be sent somewhere they can actually resolve it.

## Scope (UX only — no limit change, no backend change)

### Fix D — Smart CTA for the concurrency-limit case (Payment Failed modal)

`src/pages/BuyerPaymentSummary.tsx` around the existing `failureTerminal` branch (lines ~179–185 and ~1019–1112):

- Add a second non-terminal "blocker" state alongside `failureTerminal`. Call it `failureBlocker: "concurrency" | null`.
- After capturing `errMsg`, detect the concurrency case with `/active purchase limit/i.test(errMsg)` and set `failureBlocker = "concurrency"`. Keep `failureTerminal = null` (the transaction itself is still payable; the buyer is the bottleneck).
- In the modal:
  - Heading: **"Purchase Limit Reached"** (instead of "Payment Failed" / "Transaction No Longer Payable").
  - Subtitle: the raw `failureReason` (already correct).
  - Replace the Retry Payment + Return to Review pair with:
    1. Primary: **View My Transactions** → `/dashboard/transactions` (where they can complete, cancel, or confirm receipt on existing rows to free up a slot).
    2. Secondary: **Return to Review** → `/t/${shareToken}` (unchanged).
  - Keep the "Contact support if card appears charged" row.
  - Keep the "No funds were deducted" reassurance block — it's still true (no charge happened) and reduces anxiety.
- All other 4xx/5xx and `failureTerminal` branches keep today's behavior.

### Reset on close

`setFailureBlocker(null)` wherever `setFailureTerminal(null)` is already called (modal open path and dismiss path), so a later genuine card-decline doesn't inherit the wrong CTA.

## Out of scope (deferred / not changing)

- The limit value (5) and the `CONCURRENT_BY_LEVEL` matrix — backend policy, not touched.
- Adding a pre-emptive lock banner on `/t/:token/pay` for the concurrency case. The existing `canPay` / `lockReason === "concurrency"` banner is driven by `buyer-permissions` and already covers the proactive path on the Review page; the modal fix is enough to recover from the slip-through.
- `initiate-paystack-payment`, pricing, escrow, cart locking, terminal-status guards (already shipped in the prior turn).

## Files modified

- `src/pages/BuyerPaymentSummary.tsx` (state, error detection, modal render branch).

## Verification

1. With a buyer that already has 5 active transactions, open a 6th `/t/:token/pay` and press Pay.
2. Modal opens with heading **"Purchase Limit Reached"**, subtitle quoting `"You've reached your active purchase limit (5)…"`, primary CTA **View My Transactions** linking to `/dashboard/transactions`, secondary **Return to Review**. No Retry button visible.
3. Trigger a normal card decline on a buyer under the limit → modal still reads "Payment Failed" with the original Retry Payment + Return to Review pair.
4. Hit a `cancelled` share token → modal still reads "Transaction No Longer Payable" with the Back to Marketplace CTA from the previous turn.
