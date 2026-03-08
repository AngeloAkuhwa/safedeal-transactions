

# Add Logout to Header + Protected Routes

## Route Classification

| Route | Protection |
|---|---|
| `/` | Public |
| `/auth` | Public (redirect away if already logged in) |
| `/reset-password` | Public (must be accessible from email link) |
| `/role-selection` | Protected (requires session) |
| `/dashboard` | Protected (requires session + role) |
| `*` (404) | Public |

## Changes

### 1. New: `src/components/auth/ProtectedRoute.tsx`
- Checks session via `getSession()` + `onAuthStateChange`
- No session → redirect to `/auth?mode=login`
- Optional `requireRole` prop: if set, checks `getUserRoles()` and redirects to `/role-selection` if none found
- Shows spinner while checking
- Renders `<Outlet />` when authorized

### 2. Modified: `src/App.tsx`
Wrap only protected routes:
```tsx
<Route path="/" element={<Index />} />           {/* public */}
<Route path="/auth" element={<Auth />} />         {/* public */}
<Route path="/reset-password" element={<ResetPassword />} /> {/* public */}

<Route element={<ProtectedRoute />}>
  <Route path="/role-selection" element={<RoleSelection />} />
</Route>
<Route element={<ProtectedRoute requireRole />}>
  <Route path="/dashboard" element={<Dashboard />} />
</Route>

<Route path="*" element={<NotFound />} />         {/* public */}
```

### 3. Modified: `src/components/landing/Header.tsx`
- Import `signOut`/`getSession` from auth service, `invalidateOldSessions` from session service, `useNavigate`, `LogOut` icon, `toast`
- Add `handleLogout`: get session → `invalidateOldSessions(userId)` → `signOut()` → navigate `/` + toast
- Desktop authenticated state: "Dashboard" + "Sign Out" button (ghost, LogOut icon)
- Mobile authenticated state: same in sheet

### 4. Modified: `src/pages/Auth.tsx`
- If session exists, redirect to `/role-selection`

### 5. Modified: `src/pages/Dashboard.tsx` & `src/pages/RoleSelection.tsx`
- Remove duplicated auth-check `useEffect` blocks (ProtectedRoute handles it)

### Files

| File | Action |
|---|---|
| `src/components/auth/ProtectedRoute.tsx` | New |
| `src/components/landing/Header.tsx` | Modified |
| `src/App.tsx` | Modified |
| `src/pages/Auth.tsx` | Modified |
| `src/pages/Dashboard.tsx` | Modified |
| `src/pages/RoleSelection.tsx` | Modified |

No database changes needed.

