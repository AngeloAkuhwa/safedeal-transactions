

# Redesign Payment Failed Screen + Direct Retry

## What Changes

### 1. Replace the current failed modal (lines 856-909) with a full-page failed screen
The current implementation is a simple modal overlay. The uploaded design shows a centered card layout with:
- Red gradient top bar
- Pulsing error icon with exclamation badge
- "Payment failed" title + description
- Money Status Summary panel (amber/red badges showing "Awaiting Payment" + "Payment Failed")
- Transaction Info block (amount + transaction code) — populated from `data`
- "What you can do next" section with 3 buttons: Retry, Return to review, Contact support
- Green security reassurance box ("No funds were deducted")
- Help link footer

Font sizes will be scaled down ~15-20% from the HTML design to match React/Tailwind rendering (e.g., `text-2xl` not `text-3xl` for title, `text-xs` for labels).

### 2. Retry payment button opens Paystack directly (no agreement checkbox)
Currently "Retry Payment" just closes the failed modal (`setShowFailed(false)`), sending the user back to the main page where they must re-check the agreement checkbox.

**New behavior**: Create a `handleRetryPay` function that:
- Skips the `agreedToTerms` check (agreement was already accepted)
- Calls `initiate-paystack-payment` directly
- Opens `PaystackPop.setup()` immediately
- On success → show success screen; on failure → stay on failed screen with updated error

This reuses most of `handlePay` logic but bypasses the checkbox guard.

### Files to Edit

| File | Change |
|------|--------|
| `src/pages/BuyerPaymentSummary.tsx` | Replace failed modal (lines 856-909) with full-page failed screen matching uploaded design; add `handleRetryPay` function that calls Paystack directly without requiring agreement checkbox |

### Key Implementation Details

- The failed screen replaces the modal overlay with a full-page view (same pattern as success modal but with the uploaded card design)
- Transaction data (`currencySymbol`, `totalAmount`, `data.transaction.transaction_code`) is already available in scope
- `handleRetryPay` is essentially `handlePay` without the `if (!agreedToTerms)` guard — extract shared payment logic into a helper function `openPaystackPayment()` used by both
- Add shake animation keyframe to tailwind config for the card entrance effect
- Scale dimensions: icon container `h-16 w-16` (not `h-20 w-20`), title `text-xl`, labels `text-[10px]`, card `max-w-sm`

