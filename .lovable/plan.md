

## Plan: Fix Receipt Printing & Wire Real Seller Messaging

### Issue 1 — Print/Download Receipt Shows Empty Page

**Root cause:** `TransactionReceipt.tsx` uses `style={{ display: "none" }}` on the receipt container. The `@media print` CSS tries to show it, but inline styles have higher specificity — so the receipt stays hidden when printing.

**Fix:** In `TransactionReceipt.tsx`, replace the inline `style={{ display: "none" }}` with Tailwind's `className="hidden print:block"`. Also update the `@media print` style block to hide all other page content and force the receipt visible.

### Issue 2 — Send Message Has No Backend

**Root cause:** `ContactSellerModal` currently uses a mock `setTimeout` — no database table exists for messages, no edge function, and no notification is created for the seller.

**Implementation:**

1. **Create `transaction_messages` table** via migration:
   - Columns: `id`, `transaction_id` (FK), `sender_user_id`, `recipient_user_id`, `message_text`, `created_at`
   - RLS: transaction parties can SELECT/INSERT their own messages
   - Enable realtime on the table

2. **Create `send-seller-message` edge function** (`supabase/functions/send-seller-message/index.ts`):
   - Authenticates the buyer
   - Validates the buyer is a party to the transaction
   - Looks up the seller_id from the `transactions` table
   - Inserts the message into `transaction_messages`
   - Inserts a notification into `notifications` for the seller (type: `transaction_update`, title: "New Message from Buyer")
   - Returns success

3. **Update `ContactSellerModal.tsx`:**
   - Replace the mock `setTimeout` with a real call to `supabase.functions.invoke("send-seller-message", { body: { transaction_id, message } })`
   - File attachments remain client-side only for now (future: upload to storage)

4. **Update `supabase/config.toml`:**
   - Add `[functions.send-seller-message]` with `verify_jwt = false`

### Files to Create
| File | Purpose |
|------|---------|
| `supabase/functions/send-seller-message/index.ts` | Edge function to store message + notify seller |

### Files to Modify
| File | Change |
|------|--------|
| `src/components/transactions/TransactionReceipt.tsx` | Fix `display:none` → Tailwind `hidden print:block` |
| `src/components/transactions/ContactSellerModal.tsx` | Replace mock send with real edge function call |
| `supabase/config.toml` | Add send-seller-message function config |

### Database Migration
- Create `transaction_messages` table with RLS policies
- Enable realtime on the table so sellers get instant updates when logged in

