

# Create API Service Layer for Auth & Onboarding

## Problem
All Supabase calls are made directly inside UI components. This tightly couples data access to the view layer, making it harder to maintain, test, and refactor.

## Approach
Create a `src/services/` directory with focused service modules that encapsulate all Supabase interactions. Components will import and call these service functions instead of using the Supabase client directly.

## Service Modules

### 1. `src/services/auth.service.ts` — Authentication operations
Wraps all `supabase.auth.*` calls with typed return values.

| Function | Current location | What it does |
|---|---|---|
| `signUp(email, password, metadata)` | SignupForm.tsx | `supabase.auth.signUp()` |
| `signIn(email, password)` | LoginForm.tsx | `supabase.auth.signInWithPassword()` |
| `signOut()` | Dashboard.tsx, RoleSelection.tsx | `supabase.auth.signOut()` |
| `getSession()` | Multiple files | `supabase.auth.getSession()` |
| `onAuthStateChange(callback)` | Header.tsx | `supabase.auth.onAuthStateChange()` |
| `resendVerificationEmail(email)` | EmailVerificationPending.tsx | `supabase.auth.resend()` |
| `resetPasswordForEmail(email, redirectTo)` | ForgotPasswordModal.tsx | `supabase.auth.resetPasswordForEmail()` |
| `updatePassword(password)` | ResetPassword.tsx | `supabase.auth.updateUser()` |

### 2. `src/services/session.service.ts` — Session management
Handles the single-device session enforcement logic.

| Function | Current location |
|---|---|
| `invalidateOldSessions(userId)` | LoginForm.tsx |
| `createSession(userId, accessToken)` | LoginForm.tsx |

### 3. `src/services/role.service.ts` — Role selection & querying
Encapsulates user role CRUD against `user_roles` and `profiles`.

| Function | Current location |
|---|---|
| `getUserRoles(userId)` | LoginForm.tsx, RoleSelection.tsx |
| `assignRole(userId, role)` | RoleSelection.tsx — inserts into `user_roles` + updates `profiles.default_role` |

## Component Changes

Each component's Supabase imports get replaced with service imports. The component logic stays the same, just calling e.g. `authService.signIn(email, password)` instead of `supabase.auth.signInWithPassword(...)`.

| File | Change |
|---|---|
| `src/components/auth/LoginForm.tsx` | Use `auth.service`, `session.service`, `role.service` |
| `src/components/auth/SignupForm.tsx` | Use `auth.service` |
| `src/components/auth/EmailVerificationPending.tsx` | Use `auth.service` |
| `src/components/auth/ForgotPasswordModal.tsx` | Use `auth.service` |
| `src/components/landing/Header.tsx` | Use `auth.service` |
| `src/pages/RoleSelection.tsx` | Use `auth.service`, `role.service` |
| `src/pages/Dashboard.tsx` | Use `auth.service` |
| `src/pages/ResetPassword.tsx` | Use `auth.service` |

## Service Return Pattern
Each service function returns a consistent `{ data, error }` shape to keep error handling uniform across components. Example:

```ts
// src/services/auth.service.ts
export const signIn = async (email: string, password: string) => {
  return supabase.auth.signInWithPassword({ email, password });
};

// src/services/role.service.ts
export const assignRole = async (userId: string, role: "buyer" | "seller") => {
  const { error: roleError } = await supabase
    .from("user_roles")
    .insert({ user_id: userId, role, is_primary: true });
  if (roleError) return { success: false, error: roleError.message };

  await supabase.from("profiles").update({ default_role: role }).eq("id", userId);
  return { success: true, error: null };
};
```

## Files Created/Modified

| File | Action |
|---|---|
| `src/services/auth.service.ts` | **New** |
| `src/services/session.service.ts` | **New** |
| `src/services/role.service.ts` | **New** |
| 8 component/page files listed above | **Modified** — replace direct Supabase calls with service imports |

No database or migration changes needed.

