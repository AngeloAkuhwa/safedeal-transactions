

# Seller Payouts Upgrades — Edit Modal, Payout Accounts Table, Context-Aware Actions

## Summary

Three upgrades to transform the existing Seller Payouts page from a display-only dashboard into an operational finance center: (1) a `payout_accounts` database table for secure bank detail storage, (2) an "Edit Payout Details" modal with inline verification, and (3) context-aware row actions that route sellers to the right page based on payout/transaction state.

## Technical Details

### 1. Database Migration: `payout_accounts` table

```sql
CREATE TABLE public.payout_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_code TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  account_name TEXT NOT NULL,
  masked_account_number TEXT NOT NULL,
  provider_recipient_code TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending',
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);
ALTER TABLE public.payout_accounts ENABLE ROW LEVEL SECURITY;
-- Users can read and manage their own payout account
CREATE POLICY "Users read own payout account"
  ON public.payout_accounts FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users manage own payout account"
  ON public.payout_accounts FOR ALL TO authenticated
  USING (user_id = auth.uid());
-- updated_at trigger
CREATE TRIGGER update_payout_accounts_updated_at
  BEFORE UPDATE ON public.payout_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

Only masked account numbers are stored. Full account numbers are never persisted — they are sent to the payment provider (Paystack) to create a recipient, and only the last 4 digits are saved for display.

### 2. New Edge Function: `update-payout-account`

**File:** `supabase/functions/update-payout-account/index.ts`

- Accepts: `bank_code`, `bank_name`, `account_number`, `account_name`
- Validates input with Zod
- Masks account number (keeps last 4 digits only: `**** **** 4892`)
- Upserts into `payout_accounts` table
- Returns saved record (masked)
- Future: call Paystack "resolve account" API to verify account name before saving

### 3. Update Edge Function: `seller-payouts`

**File:** `supabase/functions/seller-payouts/index.ts`

Replace the placeholder payout account data with a real query to `payout_accounts`:
- Read `bank_name`, `account_name`, `masked_account_number`, `verification_status`, `last_verified_at` from `payout_accounts` where `user_id = sellerId`
- Fall back to current placeholder values if no record exists

### 4. New Component: `EditPayoutDetailsModal`

**File:** `src/components/seller/EditPayoutDetailsModal.tsx`

A polished dialog matching SafeDeal's design system:

- **Header**: "Edit Payout Details" / "Update the bank account where released funds will be sent"
- **Fields**: Bank selector (Nigerian banks dropdown), Account Number input, Account Name (auto-filled or manual)
- **Inline verification states**: Verifying... → Verified ✓ → Could not verify ✗
- **Trust notes**: "Only masked account details are shown after saving" and "Changes may require reverification"
- **Save disabled** until account name is provided and valid
- **UX rule**: When editing existing account, the modal does NOT prefill the old full account number — seller must enter a new one

### 5. Update Page: `SellerPayouts.tsx`

Two changes:

**A. Payout Account card — modal integration**
- "Edit Payout Details" button opens the modal instead of linking to `/seller/profile`
- "Complete Verification" CTA also opens the modal when no account exists
- After successful save, refetch payout data to reflect updated bank details

**B. Context-aware row actions in Payout History table**

Replace the current generic actions with state-driven routing:

| Payout Status | Action Label | Destination |
|---|---|---|
| `completed` | View Payout | `/seller/transactions/{id}` |
| `processing` / `pending` | View Transaction | `/seller/transactions/{id}` |
| `failed` | Retry | Toast notification (future: actual retry) |

For blocked/delayed fund cards in the sidebar:

| Blocker | Action | Destination |
|---|---|---|
| Dispute in review | View Dispute | `/seller/transactions/{id}` (dispute section) |
| Payout verification needed | Fix Payout Details | Opens Edit Modal |

Transaction codes in each row become clickable links to `/seller/transactions/{id}`.

### 6. Service Update: `seller-payouts.service.ts`

Add:
- `PayoutAccount` interface updated with `verification_status` field
- `updatePayoutAccount(bankCode, bankName, accountNumber, accountName)` function calling the new edge function

### 7. Config: `supabase/config.toml`

Add `[functions.update-payout-account]` with `verify_jwt = false`.

## Files Summary

| File | Action |
|---|---|
| DB migration | New `payout_accounts` table |
| `supabase/functions/update-payout-account/index.ts` | New |
| `supabase/functions/seller-payouts/index.ts` | Edit — read from `payout_accounts` |
| `supabase/config.toml` | Add function config |
| `src/components/seller/EditPayoutDetailsModal.tsx` | New |
| `src/pages/SellerPayouts.tsx` | Edit — modal + context actions |
| `src/services/seller-payouts.service.ts` | Edit — add update function |

