

# Fix Stale Limit Text in Verification Sections

## Problem

The `AccountVerificationSection` component has **hardcoded limit values** from the old tier structure that no longer match the actual backend limits. Three specific text strings are wrong:

| Location | Currently Says | Should Say |
|---|---|---|
| Line 82 (unlock message) | "up to ₦100,000" | "up to ₦50,000" |
| Line 289 (basic_verified banner) | "up to ₦100,000" | "up to ₦50,000" |
| Line 297 (next level teaser) | "up to ₦500,000 and 5 concurrent" | "up to ₦200,000 and 3 concurrent" |

## Fix

**Better approach:** Instead of hardcoding new values (which will break again if limits change), derive the text from the `permissions` object that is already passed as a prop. This makes the UI always consistent with the backend.

### File: `src/components/profile/AccountVerificationSection.tsx`

1. **Line 82** — Change the phone unlock message to use the actual `basic_verified` limit dynamically. Since we don't have the next-tier permissions available at this point, use a simple static fix: `"Verify your phone to unlock protected transactions"` (drop the amount).

2. **Line 289** — Replace hardcoded `₦100,000` with `formatNaira(permissions.transactionLimitNaira)` so it reads the actual current-tier limit.

3. **Lines 295-297** — Replace hardcoded `₦500,000 and 5 concurrent purchases` with the correct values for `trusted_buyer`: `₦200,000 and 3 concurrent purchases`. Since we don't have a next-tier lookup, use the corrected static values matching the current backend constants.

### Single file changed
`src/components/profile/AccountVerificationSection.tsx` — 3 line edits.

