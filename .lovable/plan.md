

# Plan: Show BuyerNav on Review Page When Authenticated

## Problem
The `/t/:shareToken` review page always shows a minimal header (logo + theme toggle), even when the user is logged in as a buyer. Authenticated buyers lose access to the standard navigation (Dashboard, Transactions, Disputes, etc.).

## Solution
Conditionally render `BuyerNav` when the user is authenticated with a buyer role, and fall back to the minimal `ReviewHeader` for anonymous/needs-role users.

## Changes

### `src/pages/BuyerTransactionReview.tsx`
1. Import `BuyerNav` and `useBuyerIdentity`
2. In the existing `authState` logic, the page already tracks `"ready"` (authenticated buyer), `"anonymous"`, and `"needs-role"`
3. Replace all `<ReviewHeader />` usages with a conditional:
   - If `authState === "ready"` → render `<BuyerNav buyerName={buyerName} avatarUrl={avatarUrl} />`
   - Otherwise → render `<ReviewHeader />` (existing minimal header)
4. Call `useBuyerIdentity()` at the top of the component to get `buyerName` and `avatarUrl` (the hook is safe to call unconditionally — it just returns defaults when no session exists)

This is a small, contained change — just swapping the header component based on the already-computed auth state.

