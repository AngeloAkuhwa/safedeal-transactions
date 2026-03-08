

# Rebuild Role Selection Page

## What Changes

Replace the current minimal `RoleSelection.tsx` with a full-featured page matching the uploaded HTML design. The new page includes:

### UI Structure (from the HTML reference)
1. **Header** — SafeDeal logo + nav (reuse existing pattern, auth-aware)
2. **Hero section** — "Choose your role" heading with "Account Setup" badge
3. **Two detailed role cards** side by side:
   - **Buyer card**: blue theme, 3 feature bullets (Payment Protection, Verification Control, Dispute Window), "Your Responsibility" callout, "Continue as Buyer" button
   - **Seller card**: green theme, 3 feature bullets (Secure Payment Guarantee, Delivery Proof Required, Automatic Release), "Your Responsibility" callout, "Continue as Seller" button
4. **Three info cards** below: Switch Anytime, Dual Roles, Always Protected
5. **Trust protection banner** — "Both roles are protected by SafeDeal" with Locked Agreements / Evidence Records / Escrow Holding chips
6. **Security banner** — "Your information is secure" with encryption/GDPR badges
7. **Footer** — reuse existing landing page Footer component

### Backend Logic Changes
- On role selection: **insert into `user_roles`** table (not just update `profiles.default_role`)
- Also update `profiles.default_role`
- On mount: check `user_roles` — if user already has a role, skip this screen and redirect to `/dashboard`
- Auth guard: redirect to `/auth` if not logged in or email not verified

### Routing
- Add auto-skip logic in `LoginForm.tsx`: after login, check if user already has roles → go to `/dashboard` directly instead of always going to `/role-selection`

## Files Changed

| File | Action |
|---|---|
| `src/pages/RoleSelection.tsx` | Full rewrite with detailed UI from HTML reference |
| `src/components/auth/LoginForm.tsx` | After login, check `user_roles` to decide `/role-selection` vs `/dashboard` |

## RLS Check
The `user_sessions` INSERT policy exists. For `user_roles`:
- Current RLS has no INSERT policy for regular users — **need a migration** to add an INSERT policy so authenticated users can insert their own role.

### Migration Needed
```sql
CREATE POLICY "users_insert_own_role"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
```

## Key Design Decisions
- Use `lucide-react` icons (ShoppingBag, Store, CheckCircle, ArrowLeftRight, Users, Shield, Lock, FileText, Camera, Vault) instead of FontAwesome
- Tailwind classes adapted to match the project's existing theme tokens (primary, success/green, warning/amber, neutral/muted)
- Confirmation modal from HTML design included for role switch confirmation
- Reuse landing page `Footer` component

