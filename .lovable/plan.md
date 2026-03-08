

# Fix Post-Login Routing: Add Role Selection Page

## Problem
After login, users are navigated to `/dashboard` which doesn't exist (404). The correct flow per the user journey is:
- Verified login → **Role Selection** page
- Email not verified → Email Verification Pending state

Two places navigate to `/dashboard`:
1. `LoginForm.tsx` line 74: `navigate("/dashboard")`
2. `EmailVerificationPending.tsx` line 46: `navigate("/dashboard")`

## Plan

### 1. Create Role Selection Page (`src/pages/RoleSelection.tsx`)
A simple page where authenticated users choose their role (buyer/seller). This is the correct post-auth destination.
- Show two cards: "Continue as Buyer" and "Continue as Seller"
- Pre-select based on `default_role` from profile if available
- Include SafeDeal branding, back-to-home link
- On selection, navigate to `/dashboard` (placeholder for now — future screens will replace this)
- Check auth state on mount — if not logged in, redirect to `/auth`
- If email not verified, redirect to `/auth` with verification state

### 2. Update LoginForm.tsx
Change `navigate("/dashboard")` → `navigate("/role-selection")`

### 3. Update EmailVerificationPending.tsx
Change `navigate("/dashboard")` → `navigate("/role-selection")`

### 4. Update App.tsx
Add route: `/role-selection` → `RoleSelection`

### 5. Create minimal Dashboard placeholder (`src/pages/Dashboard.tsx`)
Just a "Welcome to SafeDeal" page so role selection has somewhere to send users. Add `/dashboard` route.

## Files Changed

| File | Action |
|---|---|
| `src/pages/RoleSelection.tsx` | New — role selection screen |
| `src/pages/Dashboard.tsx` | New — minimal placeholder |
| `src/components/auth/LoginForm.tsx` | Change navigate target to `/role-selection` |
| `src/components/auth/EmailVerificationPending.tsx` | Change navigate target to `/role-selection` |
| `src/App.tsx` | Add `/role-selection` and `/dashboard` routes |

