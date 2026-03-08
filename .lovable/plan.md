

# Authentication Screen Enhancement

## What exists vs what's needed

The auth screen is already 80% built. The core forms, Supabase integration, forgot password, reset password, session invalidation, back-to-home link, and dark mode all work. Here's what needs to change:

## Changes

### 1. Email Verification Pending State (SignupForm.tsx)
The current success state is a simple "Check your email" card with no actions. Replace with a full verification pending state containing:
- Success icon + "Check your email" heading
- "Resend Verification Email" button (calls `supabase.auth.resend({ type: 'signup', email })`)
- "I've verified my email" button (calls `supabase.auth.getSession()` to check, then navigates to `/dashboard` or shows "still pending" toast)
- "Back to Home" link → `/`
- "Go to Login" link → switches to login tab or navigates to `/auth?mode=login`

### 2. Login: Handle Unverified Email (LoginForm.tsx)
Currently shows a toast "Please verify your email before logging in." Instead, surface the verification pending UI by passing state up to the parent `Auth.tsx`:
- Add an `onEmailNotVerified` callback prop to `LoginForm`
- When "Email not confirmed" error occurs, call the callback with the email
- `Auth.tsx` switches to a verification pending view (reuses the same component from signup)

### 3. Create EmailVerificationPending Component
Extract the verification pending UI into its own component `src/components/auth/EmailVerificationPending.tsx` so it can be used from both signup success and login-with-unverified-email flows. Props: `email: string`, optional callbacks.

### 4. SecurityReassurance Update (SecurityReassurance.tsx)
Match the UX Pilot design: change from 3 horizontal cards to 4 vertical cards with richer content:
- "Your data is secure" — with bullet points (256-bit SSL, PCI DSS, Two-factor auth)
- "Identity & Payment Verification"
- "Choose Your Role After Signup"
- "Account Verification" (new — mentions future verification for disputes/payouts)

### 5. Auth.tsx State Management
Add state to track verification-pending mode. When triggered (from signup success or login-unverified), show `EmailVerificationPending` instead of the tab forms. Add "Back to Home" link visible in this state too.

## Files Changed

| File | Action |
|---|---|
| `src/components/auth/EmailVerificationPending.tsx` | New — reusable verification pending UI |
| `src/components/auth/SignupForm.tsx` | Use EmailVerificationPending on success, pass email |
| `src/components/auth/LoginForm.tsx` | Add `onEmailNotVerified` callback, pass email up |
| `src/components/auth/SecurityReassurance.tsx` | Update to 4 vertical cards matching UX design |
| `src/pages/Auth.tsx` | Add state for verification-pending mode from login |

## No database or migration changes needed
All auth APIs already work. The `handle_new_user` trigger creates profiles. Session invalidation RPC exists. Supabase handles email verification natively.

