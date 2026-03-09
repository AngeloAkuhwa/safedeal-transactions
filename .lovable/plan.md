

# Plan: Payment Summary Page

## Answer to Your Question

**Yes, the Payment Summary page can reuse the same API as the Review page.** The `resolve-share-token` endpoint already returns everything the payment page needs: transaction details, item info, pricing (with dynamic fees), seller info, delivery terms, and escrow state. No new backend endpoint is needed.

The only difference is the **UI context** — the review page is for inspecting the deal; the payment page is for completing checkout (payment method, billing address, terms checkbox, pay button).

## What to Build

A new page at `/t/:shareToken/pay` that:
1. Fetches data using the same `getTransactionReview()` service (same `resolve-share-token` edge function)
2. Renders the checkout UI from the uploaded HTML design (`main_2-3.html`)
3. Requires authenticated buyer (redirects to auth if anonymous)

### Page Sections (from the HTML design)
- **Escrow protection info** — what SafeDeal protects
- **Current status cards** — transaction status + money status
- **What happens after payment** — 4-step process
- **Payment summary** — item thumbnail, price, Service Fee (X.X%), total
- **Payment method selection** — Card / Bank Transfer (UI only for now, Paystack integration later)
- **Billing address form** — name, address, city, state, ZIP
- **Critical warning banner** — "Do not close or refresh"
- **Escrow payment agreement** — terms checkbox
- **Sidebar**: Pay button, seller info, protection card, trust indicators
- **Modals**: Processing overlay, success modal, failure modal

### Route & Navigation
- Add route: `/t/:shareToken/pay` → `BuyerPaymentSummary` page
- Update `handlePayClick` in `BuyerTransactionReview.tsx` to navigate to `/t/${shareToken}/pay` instead of showing toast
- "Back to Review" button on payment page navigates back to `/t/${shareToken}`

### Files to Create/Modify
| File | Action |
|------|--------|
| `src/pages/BuyerPaymentSummary.tsx` | **Create** — new checkout page |
| `src/pages/BuyerTransactionReview.tsx` | **Modify** — update `handlePayClick` to route to `/t/${shareToken}/pay` |
| `src/App.tsx` | **Modify** — add route for `/t/:shareToken/pay` |

### No Backend Changes Needed
The `resolve-share-token` edge function already returns all required data:
- `transaction` (id, code, status, money_status)
- `item` (title, description, quantity, condition)
- `pricing` (item_amount, service_fee_amount, service_fee_rate, total_amount)
- `seller` (full_name, avatar_url)
- `delivery` (method, expected date, verification window)
- `media` (item images)

### Auth Handling
The payment page must require authentication. If the user is anonymous or lacks a buyer role, redirect to auth/role-selection with redirect back to the pay page.

### Payment Processing (Future)
The actual Paystack payment integration is a separate task. For now, the Pay button will show a toast or processing overlay as a placeholder. The form fields (card number, billing address) are rendered but not yet functional.

