
# Fix: Escrow Banner State Logic + Typography/Dimension Refinements

## Problem 1: Escrow Banner — Wrong Condition (line 313)

Current broken condition:
```
{escrow && !["cancelled", "refunded"].includes(tx.status) && (
```

This is wrong. The correct logic is to drive the banner entirely from `escrow.state`:

| `escrow.state` | Banner variant | Title |
|---|---|---|
| `funds_held` | Blue/primary | "Escrow Protection Active" |
| `funds_frozen` | Red/destructive | "Funds Frozen — Dispute In Progress" |
| `funds_released` | Green/success | "Transaction Completed — Funds Released" |
| anything else | Hidden | — |

The banner text also updates:
- **funds_held**: "Your payment of X is securely held by SafeDeal. Funds will be released to the seller once you verify..."
- **funds_frozen**: "Your funds are currently frozen while the dispute is under review. No money will move until the dispute is resolved."
- **funds_released**: "Your payment of X has been successfully released to the seller. This transaction is now complete."

Amount shown:
- `funds_held` → `escrow.held_amount`
- `funds_frozen` → `escrow.frozen_amount`
- `funds_released` → `escrow.released_amount`

## Problem 2: Typography + Dimensions — Precise Fixes

Based on reading all 863 lines, here are all the font/spacing issues vs. the reference:

### Header Card (lines 277–329)
- Line 277: `p-4 sm:p-6 lg:p-8` → `p-4 sm:p-6` (remove lg:p-8)
- Line 281: `text-2xl sm:text-3xl` → `text-xl sm:text-2xl` (transaction code h1)
- Line 284: `text-sm sm:text-base` → `text-sm` (created-on subtitle)
- Line 289: `text-sm sm:text-base` → `text-sm` (button text)
- Line 294: `text-sm sm:text-base` → `text-sm` (More Actions button)

### 3-col Grid (line 332–335)
- Line 332: `gap-6 sm:gap-8` → `gap-5 sm:gap-6`
- Line 335: `space-y-6 sm:space-y-8` → `space-y-5 sm:space-y-6`

### Item Details card (lines 352–392)
- Line 352: `p-4 sm:p-6 lg:p-8` → `p-4 sm:p-6`
- Line 353: `text-xl sm:text-2xl` → `text-base sm:text-lg` (heading)
- Line 354: `h-5 w-5 sm:h-6 sm:w-6` → `h-5 w-5` (icon)
- Line 358: `h-64 sm:h-80` → `h-52 sm:h-64` (image box)
- Line 362: `text-xl sm:text-2xl` → `text-lg sm:text-xl` (item title h3)
- Lines 364, 370, 377: `text-sm sm:text-base` → `text-sm` (item row labels)

### Delivery Details card (lines 396–448)
- Line 396: `p-4 sm:p-6 lg:p-8` → `p-4 sm:p-6`
- Line 397: `text-xl sm:text-2xl` → `text-base sm:text-lg` (heading)
- Line 398: `h-5 w-5 sm:h-6 sm:w-6` → `h-5 w-5`
- Lines 405, 409, 414: `text-base sm:text-lg` → `text-sm sm:text-base` (delivery values)
- Line 402 gap: `gap-4 sm:gap-6` → `gap-4 sm:gap-5`

### Timeline card (lines 452–464)
- Line 452: `p-4 sm:p-6 lg:p-8` → `p-4 sm:p-6`
- Line 453: `text-xl sm:text-2xl` → `text-base sm:text-lg`
- Line 454: `h-5 w-5 sm:h-6 sm:w-6` → `h-5 w-5`

### Buyer Protection card (lines 467–500)
- Line 467: `p-4 sm:p-6 lg:p-8` → `p-4 sm:p-6`
- Line 468: `text-xl sm:text-2xl` → `text-base sm:text-lg`
- Line 469: `h-5 w-5 sm:h-6 sm:w-6` → `h-5 w-5`
- Line 476: `text-sm sm:text-base` → `text-sm`
- Line 477: `text-xs sm:text-sm` → `text-xs`
- Line 484: `text-sm sm:text-base` → `text-sm`

### Contact Seller card (lines 503–514)
- Line 503: `p-4 sm:p-6 lg:p-8` → `p-4 sm:p-6`
- Line 504: `text-xl sm:text-2xl` → `text-base sm:text-lg`
- Line 505: `h-5 w-5 sm:h-6 sm:w-6` → `h-5 w-5`
- Line 508: `text-sm sm:text-base` → `text-sm`
- Line 511: `text-sm sm:text-base` → `text-sm`

### Dispute card (line 518)
- Line 518: `p-4 sm:p-6 lg:p-8` → `p-4 sm:p-6`
- Line 519: `text-xl sm:text-2xl` → `text-base sm:text-lg`
- Line 520: `h-5 w-5 sm:h-6 sm:w-6` → `h-5 w-5`

### Right sidebar — desktop (lines 566–659)
- Lines 566, 616: `p-4 sm:p-6 lg:p-8` → `p-4 sm:p-6`
- Line 567: `text-lg sm:text-xl` → `text-base sm:text-lg`
- Line 568: `mb-4 sm:mb-6` → `mb-3 sm:mb-4`
- Line 571: `mb-4 sm:mb-6` → `mb-3 sm:mb-4`
- Line 572: `h-14 sm:h-16 w-14 sm:w-16` → `h-12 sm:h-14 w-12 sm:w-14`
- Line 581: `text-base sm:text-lg` → `text-sm sm:text-base`
- Lines 586: `text-xs sm:text-sm` → `text-xs`
- Lines 617: `text-lg sm:text-xl` → `text-base sm:text-lg`
- Line 622: `text-sm sm:text-base` → `text-sm`
- Line 627: `text-sm sm:text-base` → `text-sm`
- Line 633: `text-sm sm:text-base` → `text-sm`
- Line 638: `text-base sm:text-lg` → `text-sm sm:text-base` (Total Paid label)
- Line 640: `text-xl sm:text-2xl` → `text-lg sm:text-xl` (Total Paid amount)
- Line 548: `space-y-6 sm:space-y-8` → `space-y-5 sm:space-y-6`

### NextActionCard (lines 141–207)
- Line 147: `text-xl font-bold` → `text-lg font-bold`
- Line 157: `text-3xl font-bold` → `text-2xl sm:text-3xl font-bold`

## File to Edit
Single file: `src/pages/BuyerTransactionDetail.tsx`

All changes are targeted line replacements. No new dependencies. No structural changes.
