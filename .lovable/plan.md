

# Plan: Buyer Transaction Review Page, Secure Link Flow & Seller Edit Lock

## Overview

Build the complete pre-payment buyer journey: a public `/t/:shareToken` route that resolves a seller's payment link, shows a full Transaction Review page (from the uploaded HTML reference), persists redirect URLs through auth/role-selection, and enforces a database-level seller edit lock after payment.

---

## 1. Database Migration

**Seller edit lock trigger:**
- Create `prevent_edit_after_agreement_lock()` SECURITY DEFINER function that checks `transactions.agreement_locked_at IS NOT NULL` for the parent transaction
- Attach as `BEFORE UPDATE` trigger on `transaction_items`, `transaction_pricing`, `transaction_delivery_terms`
- If locked, raises exception: "Cannot modify a locked agreement"

**Public access for share tokens:**
- Add RLS policy on `transaction_links` allowing anonymous `SELECT` where `is_active = true` (needed for the public resolve endpoint)

---

## 2. Edge Function: `supabase/functions/resolve-share-token/index.ts`

- Public endpoint (`verify_jwt = false`)
- Accepts `{ shareToken }` in body
- Uses service role to look up `transaction_links` by `share_token` where `is_active = true`
- Fetches in parallel: transaction, item details, pricing, delivery terms, seller profile + `account_verifications`, escrow state, transaction media
- Returns all data needed for the review page (no sensitive fields)

**Config:** Add `[functions.resolve-share-token]` with `verify_jwt = false` to `supabase/config.toml`

---

## 3. Service: `src/services/review.service.ts`

- `getTransactionReview(shareToken: string)` — calls `supabase.functions.invoke("resolve-share-token", { body: { shareToken } })`
- No auth header needed (public endpoint)
- Export `ReviewData` interface matching the edge function response

---

## 4. New Page: `src/pages/BuyerTransactionReview.tsx`

Route: `/t/:shareToken` (public, outside ProtectedRoute)

Faithfully translates the uploaded HTML reference into React/Tailwind with lucide-react icons. Sections:

- **Green trust banner** + **Red fraud prevention banner**
- **Transaction header**: code, "Payment Pending" badge, "Review Transaction Agreement" title
- **Money state preview**: Transaction Status (Awaiting Payment) + Money Status (Not Yet Secured)
- **Lock warning card**: "Agreement Becomes Permanently Locked After Payment" with bullet list + info banner: "The seller may still update details until payment is completed"
- **Left column (2/3)**:
  - Seller identity card (name, email, verification badges, trust profile grid with identity/phone/payout/member-since, success rate, avg rating)
  - Item details card (title, description, image gallery with horizontal scroll, quantity/condition/warranty grid)
  - Delivery & Verification card (method, expected date, verification window, process explanation)
  - Transaction timeline (7-step vertical: Created → Payment Pending [current] → Funds Held → Seller Fulfillment → Delivered → Verification → Completed)
- **Right column (1/3, sticky)**:
  - Escrow protection card (green gradient)
  - Critical fraud warning card (red gradient)
  - Next Action card (blue gradient) with auth-aware CTA:
    - No session → "Sign Up to Pay" button → `/auth?redirect=/t/:shareToken`
    - Session + buyer role → "Pay $X" button (mock toast for now)
    - Session, no role → redirect to `/role-selection?redirect=/t/:shareToken`
  - "Decline Transaction" button
  - Payment summary card (item price, fee, total)
  - Protection features card (4 items)
  - Trust indicators card (dark, SSL/PCI/monitoring)
- **How SafeDeal Protects You** (4-step grid)
- **FAQ section** (4 questions from reference)
- **Footer**

Auth detection uses `supabase.auth.getSession()` on mount to determine which CTA to show, without requiring ProtectedRoute.

---

## 5. Auth Redirect Persistence

### `Auth.tsx`
- Read `redirect` query param on mount → store in `sessionStorage` key `safedeal_redirect`
- When session is detected, navigate to stored redirect (if present) instead of `/role-selection`

### `RoleSelection.tsx`
- After successful role assignment, check `sessionStorage` for `safedeal_redirect`
- If found → navigate there and clear it; otherwise → `/dashboard`

### `ProtectedRoute.tsx`
- When redirecting to `/auth`, append current path as `redirect` param: `/auth?mode=login&redirect={encodeURIComponent(currentPath)}`
- When redirecting to `/role-selection`, append redirect: `/role-selection?redirect={encodeURIComponent(currentPath)}`

---

## 6. Route Update: `App.tsx`

Add as a public route (outside ProtectedRoute blocks):
```
<Route path="/t/:shareToken" element={<BuyerTransactionReview />} />
```

---

## 7. Agreement Page Awareness: `BuyerTransactionAgreement.tsx` + `AgreementHero.tsx`

- Check `data.transaction.money_status` — if pre-payment (`not_secured`), show "Agreement Preview" mode:
  - Title: "Transaction Agreement Preview"
  - Banner: "This agreement is not yet locked. The seller may still update details until you complete payment."
  - Hide "Payment Confirmed" badge
- If post-payment, show existing locked view unchanged
- Pass `isLocked` boolean prop to `AgreementHero`

---

## Files Summary

| Action | File |
|--------|------|
| Create | `supabase/functions/resolve-share-token/index.ts` |
| Create | `src/services/review.service.ts` |
| Create | `src/pages/BuyerTransactionReview.tsx` |
| Modify | `supabase/config.toml` — add resolve-share-token config |
| Modify | `src/App.tsx` — add `/t/:shareToken` route |
| Modify | `src/pages/Auth.tsx` — redirect persistence |
| Modify | `src/pages/RoleSelection.tsx` — redirect after role assignment |
| Modify | `src/components/auth/ProtectedRoute.tsx` — pass redirect params |
| Modify | `src/pages/BuyerTransactionAgreement.tsx` — preview vs locked |
| Modify | `src/components/agreement/AgreementHero.tsx` — accept isLocked prop |
| Migration | Edit lock trigger + anon RLS policy on transaction_links |

