## Goal

1. Add the official SafeDeal logo (shield + green check) to the project so we can use it as a brand asset.
2. Show a branded SafeDeal splash screen (spinning logo) while auth + role checks run, instead of the small generic spinner currently used by `ProtectedRoute`.
3. After a successful admin login (or when an already-signed-in admin opens `/auth`), route them straight to `/admin/dashboard`.
4. When a signed-in admin tries to access a non-admin route inside the app (e.g. `/dashboard`, `/seller`, `/role-selection`), redirect them back to `/admin/dashboard`.

## Changes

### 1. Add the SafeDeal logo asset
- Copy the uploaded logo into the project at `src/assets/safedeal-logo.png` (icon-only shield with green check, from panel "2. ICON ONLY" of the brand sheet — works on both light and dark backgrounds).
- Also copy a horizontal lockup version to `src/assets/safedeal-logo-full.png` for headers if needed later (optional, same file is fine).
- Imported via ES6 (`import logo from "@/assets/safedeal-logo.png"`) so Vite hashes/optimizes it.

### 2. New component: `src/components/auth/BrandedAuthSplash.tsx`
- Full-screen centered layout on `bg-background` (works in light & dark themes since the logo icon is colored, not monochrome).
- Renders the imported SafeDeal shield logo at ~80px, wrapped in a div with `animate-spin` (slowed to ~2s via inline `animationDuration: "2s"` style for a smooth, premium feel rather than the default 1s).
- Below the logo: "SafeDeal" wordmark in `text-foreground font-bold`, plus a muted subtitle (default: "Securing your session…", overridable via `label` prop) with `animate-pulse`.
- Pure presentational component, no data fetching.

### 3. `src/components/auth/ProtectedRoute.tsx`
- Replace the inline `Loader2` loading block with `<BrandedAuthSplash />`.
- In the `wrong-role` branch, check for `admin` first — if the user has the admin role, redirect to `/admin/dashboard` before falling back to buyer/seller dashboards. This covers an admin landing on `/dashboard`, `/seller`, `/role-selection`, etc.

### 4. `src/components/auth/LoginForm.tsx`
- After `getUserRoles`, if roles include `admin`, navigate to `/admin/dashboard` (taking precedence over buyer/seller defaults), unless a `safedeal_redirect` is stored in sessionStorage.
- Buyer/seller fallback logic stays intact.

### 5. `src/pages/Auth.tsx`
- The existing-session effect currently sends users to `/role-selection` when no stored redirect exists. Update it to also fetch roles and, if the user is an admin, push them to `/admin/dashboard`.
- While that check runs, render `<BrandedAuthSplash />` instead of the auth form to avoid a flash of the login UI for already-signed-in admins.

## Notes

- Uses Tailwind's built-in `animate-spin` and `animate-pulse` — no new keyframes needed.
- All colors via semantic tokens (`bg-background`, `text-foreground`, `text-muted-foreground`).
- No DB or edge-function changes required.
