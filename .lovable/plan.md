

# Fix: Use Valid Email for Paystack

## Problem
The edge function extracts the email from the JWT token (`buyer@samplestore.test`), which Paystack rejects because `.test` is not a valid TLD.

## Solution
Update `supabase/functions/initiate-paystack-payment/index.ts` to:

1. After extracting `userEmail` from JWT (line 40), query the `profiles` table for the user's stored email
2. Validate the email domain — if it ends in `.test`, `.example`, `.invalid`, or `.localhost`, replace it
3. Use a fallback: `info@teenscodecamp.com.ng` for testing, or more generally, use the profile email if valid

### Specific change (around line 40):
```typescript
const userId = claimsData.claims.sub as string;
let userEmail = claimsData.claims.email as string;

// Fetch profile email (may be more valid than JWT email)
const { data: profile } = await supabase
  .from("profiles")
  .select("email")
  .eq("id", userId)
  .maybeSingle();

if (profile?.email) {
  userEmail = profile.email;
}

// Fallback for invalid test TLDs that Paystack rejects
const invalidTLDs = ['.test', '.example', '.invalid', '.localhost'];
if (invalidTLDs.some(tld => userEmail.endsWith(tld))) {
  userEmail = `customer-${userId.slice(0, 8)}@safedeal.ng`;
}
```

This needs the `supabase` service client, which is created later (line 54). So we'll move the profile email lookup after the service client is created (after line 57).

## File
| File | Action |
|------|--------|
| `supabase/functions/initiate-paystack-payment/index.ts` | Edit — add profile email lookup + TLD validation fallback |

## Testing After Fix
1. Navigate to `/t/tok_seed_001/pay`
2. Check the escrow agreement checkbox
3. Click Pay — Paystack popup should open
4. Use test card: `4084 0840 8408 4081`, CVV: `408`, Expiry: any future date, OTP: `123456`

