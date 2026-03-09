
# Fix: Escrow Banner Always Visible + NextActionCard Completed State

## Two Distinct Problems

### Problem 1 — Escrow Banner (lines 313–323): Condition too narrow
**Current code** (line 313):
```
{escrow && (escrow.state === "funds_held" || tx.money_status === "funds_held_in_escrow") && (
```
For a **completed** transaction, `escrow.state` = `funds_released` and `money_status` = `funds_released` — so the banner never renders.

**Reference design (HTML line 160)**: The escrow banner is shown on the header card whenever the transaction is active. It says "Escrow Protection Active" and shows the held/paid amount.

**Fix**: Change condition to show the banner for any non-final status:
```
{escrow && !["cancelled", "refunded"].includes(tx.status) && (
```
Also update the banner text — for a **completed** transaction it should say "funds have been released" rather than "funds will be released". So we need two variants:
- Active (not completed): "Your payment of X is securely held... Funds will be released..."
- Completed: "Your payment of X has been successfully released to the seller."

The banner title changes too:
- Active: "Escrow Protection Active"  
- Completed: "Transaction Completed — Funds Released"

---

### Problem 2 — NextActionCard: "completed" state has WRONG icon
**Reference HTML (line 408)** for delivered state uses `fa-circle-exclamation` (warning/exclamation in circle).
For the **completed** state, looking at Image 2 (current) — it shows `AlertTriangle` icon on an orange card with text "Transaction Completed".

The reference design shows the completed card SHOULD be orange with a different structure — no countdown, no action buttons, just the title + description + the Other Actions section still visible.

Looking at current code (line 126–207): The `NextActionCard` already does NOT render countdown/buttons for non-`delivered_awaiting_verification` states. But the "Other Actions" section (lines 189–204) ONLY renders for `delivered_awaiting_verification`. For completed transactions, the "Other Actions" should still appear.

**Fix**: Show "Other Actions" for both `delivered_awaiting_verification` AND `completed` states.

---

### Problem 3 — NextActionCard Separator: `mb-4` missing proper spacing
Reference HTML line 416-423: After the separator, there's a `mb-6` wrapper div containing the description + countdown box.

Current code (line 152): `<p className="text-sm opacity-90 mb-4">` — the `mb-4` is on the description, but the countdown box inside has `mb-5` before it. 

Reference: description `mb-4`, then countdown box, then `mb-3` gap before verify button (which means the countdown div itself has `mb-6` wrapping not just `mb-5`).

**Fix**: Change countdown wrapper from inline to have `mb-6` consistent with reference.

---

## Exact Line Changes in `src/pages/BuyerTransactionDetail.tsx`

### Change 1 — Escrow banner condition (line 313)
```
// FROM:
{escrow && (escrow.state === "funds_held" || tx.money_status === "funds_held_in_escrow") && (
// TO:
{escrow && !["cancelled", "refunded"].includes(tx.status) && (
```

### Change 2 — Escrow banner title + text (lines 317–320)
Make it dynamic based on `tx.status`:
- Title: `tx.status === "completed" ? "Transaction Completed — Funds Released" : "Escrow Protection Active"`  
- Body: if completed → "Your payment of X has been successfully released to the seller. This transaction is now complete."
- Body: if not completed → existing text "Your payment of X is securely held..."

### Change 3 — NextActionCard "Other Actions" visibility (line 189)
```
// FROM:
{txStatus === "delivered_awaiting_verification" && (
// TO:
{(txStatus === "delivered_awaiting_verification" || txStatus === "completed") && (
```

### Change 4 — NextActionCard countdown wrapper spacing
Line 155 currently: `mb-5 text-center` on the countdown box wrapper  
Change to `mb-6 text-center` to match reference `mb-6` gap before buttons.

## Summary

| Fix | Location | Change |
|---|---|---|
| Escrow banner condition | line 313 | Remove strict state check, show for all non-cancelled/refunded |
| Escrow banner content | lines 317–320 | Dynamic title/text based on completed vs active |
| Other Actions visibility | line 189 | Also show for "completed" status |
| Countdown wrapper mb | line 155 | `mb-5` → `mb-6` |

Only `src/pages/BuyerTransactionDetail.tsx` is modified. No new dependencies.
