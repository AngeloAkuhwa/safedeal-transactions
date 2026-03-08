

# Account Verification Section — Refined Implementation Plan

## Changes

### 1. Edit `src/components/profile/AccountVerificationSection.tsx`

- Add `useNavigate` for CTA navigation to `/dashboard/verification`
- Accept optional `isLoading` prop; render skeleton rows when loading
- Dynamic descriptions based on verification state:
  - Email: `"Verified"` / `"Email verification required"`
  - Phone: `"Verified"` / `"Phone verification required"`
  - Identity: `"Identity verified"` / `"Required for high-value transactions"`
- CTA logic:
  - `identity_verified = false` → show enabled "Complete Verification" button that navigates
  - `identity_verified = true` → show "Identity verification complete" success text, no button
- Make Identity row clickable (navigates to `/dashboard/verification`) when not verified
- Badge text: "Verified" or "Not Verified" (replace current "Pending")

### 2. Create `src/pages/BuyerVerification.tsx`

Placeholder page with:
- `BuyerNav` (needs profile data — use same `useQuery(["buyer-profile"])`)
- Hero section with breadcrumb-style heading
- Card explaining verification requirements (upload ID, confirm phone, complete identity check)
- "Coming soon" message
- `Footer`

### 3. Edit `src/App.tsx`

Add route inside the buyer-protected group:
```
<Route path="/dashboard/verification" element={<BuyerVerification />} />
```

### 4. Edit `src/pages/BuyerProfileSettings.tsx`

Pass `isLoading` to `AccountVerificationSection` so it can show skeletons during profile fetch.

## Files

1. **Edit** `src/components/profile/AccountVerificationSection.tsx`
2. **Create** `src/pages/BuyerVerification.tsx`
3. **Edit** `src/App.tsx`
4. **Edit** `src/pages/BuyerProfileSettings.tsx` (pass isLoading)

No backend changes needed.

