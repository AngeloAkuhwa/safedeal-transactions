

# Build Authentication Screen

## Summary
Replace the placeholder Auth page with a full authentication screen featuring Login/Signup tabs, Supabase Auth integration, forgot password modal, and trust info panel. Includes dark mode support, profile auto-creation on signup, and session management.

## Database Changes

**Migration needed**: Create a trigger on `auth.users` to auto-create `profiles`, `account_verifications`, and `notification_preferences` on signup. The `profiles` table already exists but has no INSERT RLS policy for users and no auto-creation trigger (confirmed from db-triggers: "There are no triggers in the database").

```sql
-- Trigger function: auto-create profile + verification + notification prefs on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone, default_role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
    COALESCE((NEW.raw_user_meta_data->>'default_role')::user_role_type, 'buyer')
  );
  
  INSERT INTO public.account_verifications (user_id) VALUES (NEW.id);
  INSERT INTO public.notification_preferences (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

**Note**: This trigger attaches to `auth.users` which is a reserved schema. However, Supabase officially supports this pattern for profile creation. The trigger function itself lives in `public` schema.

## Component Architecture

```text
src/pages/Auth.tsx              -- Full rewrite: two-column layout, tab switching, Supabase auth
src/pages/ResetPassword.tsx     -- New: password reset form (required for reset flow)
src/components/auth/
  AuthInfoPanel.tsx             -- Left side: trust messaging, testimonial (Nigerian name)
  LoginForm.tsx                 -- Email + password + remember me + forgot password
  SignupForm.tsx                -- Full name + email + phone + password + confirm + terms
  ForgotPasswordModal.tsx       -- Dialog for password reset email
  SecurityReassurance.tsx       -- Below-form trust cards (encryption, verification, role hint)
```

## Page Layout

Two-column on desktop (info panel left, form right), single column on mobile (form only). Background gradient matches UX Pilot design but uses CSS variables for dark mode compatibility.

- Left panel (hidden on mobile): "Join SafeDeal" heading, 3 trust features (Lock, Zap, Headphones icons), testimonial card with Nigerian user
- Right panel: Tab switcher (Log In / Sign Up), forms, security reassurance cards below

## Auth Flow Implementation

**Signup**:
1. Validate client-side (zod): full_name required, email format, phone format, password min 8 chars with letters+numbers, confirm match, terms checkbox
2. Call `supabase.auth.signUp({ email, password, options: { data: { full_name, phone } } })`
3. Trigger auto-creates profile + verification + notification_preferences
4. Show success message: "Check your email to verify your account"
5. Do NOT auto-confirm (per instructions)

**Login**:
1. Call `supabase.auth.signInWithPassword({ email, password })`
2. On success, call `supabase.rpc('invalidate_old_sessions', { _user_id: user.id })` (already exists)
3. Navigate to `/role-selection` (placeholder route for now, just redirect to `/dashboard` or similar)

**Forgot Password**:
1. Dialog with email input
2. Call `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/reset-password' })`
3. Show success feedback

**Reset Password Page** (`/reset-password`):
1. Check URL hash for `type=recovery`
2. Form with new password + confirm
3. Call `supabase.auth.updateUser({ password })`

## Dark Mode
All components use CSS variable tokens (`bg-background`, `text-foreground`, `bg-card`, etc.). The gradient background uses `from-primary/5 via-background to-green-500/5` which adapts automatically.

## Query Params Preserved
- `?role=buyer` or `?role=seller` from landing page controls default tab (signup) and subtitle text
- `?mode=login` shows login tab by default
- Role is passed forward as user metadata on signup

## Routes Added
- `/reset-password` → `ResetPassword` page

## Files Changed

| File | Action |
|---|---|
| `src/pages/Auth.tsx` | Full rewrite |
| `src/pages/ResetPassword.tsx` | New |
| `src/components/auth/AuthInfoPanel.tsx` | New |
| `src/components/auth/LoginForm.tsx` | New |
| `src/components/auth/SignupForm.tsx` | New |
| `src/components/auth/ForgotPasswordModal.tsx` | New |
| `src/components/auth/SecurityReassurance.tsx` | New |
| `src/App.tsx` | Add `/reset-password` route |
| Migration | Auto-create profile trigger |
| `src/db/migrations/012_auth_trigger.sql` | Reference copy |

