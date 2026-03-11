

# Create Transaction Page for Sellers

## Summary
Build a multi-step "Create Protected Transaction" wizard at `/seller/transactions/new` matching the uploaded design. Handle draft resumption by checking for existing incomplete drafts on page load.

## Draft Handling Strategy
When navigating to `/seller/transactions/new`:
1. Query for existing `draft` transactions owned by the seller
2. If drafts exist, show a **draft picker banner** at the top: "You have X unfinished draft(s)" with options to "Continue Draft" or "Start Fresh"
3. "Continue Draft" loads that draft's saved data into the form steps
4. "Start Fresh" creates a new transaction record in `draft` status

## New Files

### `src/pages/SellerCreateTransaction.tsx`
Multi-step wizard with 5 steps matching the design:
1. **Buyer Info** — name, email/phone, secure link info card
2. **Item Details** — title, description, quantity, condition, photo upload zone, optional video upload
3. **Payment Details** — price input, currency select, live fee calculator (platform fee breakdown), escrow protection card, agreement lock warning
4. **Delivery Details** — delivery method select, expected date, verification window select, auto-release info card
5. **Seller Notes** — optional notes textarea, transaction summary card, "Ready to Create" confirmation

**Components:**
- Step progress bar with gradient active/completed indicators
- Back / Save Draft / Next Step / Create Transaction buttons
- Abandon modal (triggered on back-navigation when form is dirty)
- Validation per step before advancing
- Summary panel on step 5 pulling from all previous step data

**Draft resume banner:** If drafts found, show alert at top with "Continue [SD-XXXX]" or "Start New"

### `supabase/functions/create-transaction/index.ts`
Edge function handling two actions:
- `save_draft`: Upsert draft transaction + related tables (participants, items, pricing, delivery_terms, notes). If `transaction_id` provided, update existing draft; otherwise create new
- `publish`: Validate all required fields, transition status from `draft` → `awaiting_buyer`, generate share token/link, return the share URL

Uses service role key to insert across normalized tables atomically.

### `supabase/functions/seller-drafts/index.ts`
Simple edge function: fetch all `draft` status transactions for the authenticated seller with their related items/pricing/delivery/notes data pre-joined. Used by the create page to check for and load existing drafts.

### `src/services/create-transaction.service.ts`
Service layer with:
- `getSellerDrafts()` — calls `seller-drafts` function
- `saveDraft(data)` — calls `create-transaction` with action `save_draft`
- `publishTransaction(transactionId)` — calls `create-transaction` with action `publish`

## Existing File Changes

### `src/App.tsx`
Add route inside seller protected group:
```
<Route path="/seller/transactions/new" element={<SellerCreateTransaction />} />
```

### `src/components/seller/SellerDashboardHero.tsx`
Wire "Create Protected Transaction" button with `useNavigate` to `/seller/transactions/new`

### `src/pages/SellerTransactions.tsx`
Wire "Create New Transaction" button to navigate to `/seller/transactions/new`

### `supabase/config.toml`
Add `create-transaction` and `seller-drafts` function entries with `verify_jwt = false`

## Files Summary

| File | Action |
|------|--------|
| `src/pages/SellerCreateTransaction.tsx` | Create — 5-step wizard with draft resume |
| `supabase/functions/create-transaction/index.ts` | Create — save draft + publish |
| `supabase/functions/seller-drafts/index.ts` | Create — fetch seller's drafts |
| `src/services/create-transaction.service.ts` | Create — service layer |
| `src/App.tsx` | Edit — add route |
| `src/components/seller/SellerDashboardHero.tsx` | Edit — wire navigate |
| `src/pages/SellerTransactions.tsx` | Edit — wire navigate |
| `supabase/config.toml` | Edit — add function entries |

