

# Seller Profile & Settings Page — Full Implementation Plan

## Summary

Build a dedicated **Seller Profile & Settings** page at `/seller/profile` that serves as a secure account control center. It reuses existing buyer profile components where possible, adds seller-specific sections (Payout Destination, Account Status), and connects to a new `seller-profile` edge function that fetches all profile data in one call including payout account details.

## Architecture Overview

```text
┌─────────────────────────────────────────────────────┐
│  SellerProfileSettings (page)                       │
│  ├── SellerNav (existing, "Profile" active)         │
│  ├── Hero header                                    │
│  ├── 2-col layout: main (2/3) + sidebar (1/3)      │
│  │   ├── PersonalInfoSection (reuse, adapt)         │
│  │   ├── SellerVerificationSection (new)            │
│  │   ├── SecuritySection (reuse as-is)              │
│  │   ├── NotificationPreferencesSection (reuse)     │
│  │   ├── PayoutDestinationSection (new)             │
│  │   ├── DangerZoneSection (reuse as-is)            │
│  │   ├── Save / Cancel buttons                      │
│  │   └── SIDEBAR:                                   │
│  │       ├── TrustSafetyPanel (reuse as-is)         │
│  │       └── AccountStatusCard (new)                │
│  └── Footer                                         │
└─────────────────────────────────────────────────────┘
```

## Data Flow

The page calls a single edge function `seller-profile` (GET) that returns:
- `profile`: from `profiles` table (full_name, email, phone, avatar_url, country_code, state_name, city_name, created_at)
- `verification`: from `account_verifications` (email, phone, identity, payout verified + region eligibility from profiles)
- `preferences`: from `notification_preferences`
- `payout_account`: from `payout_accounts` (bank_name, account_name, masked_account_number, verification_status, last_verified_at, updated_at)
- `account_meta`: member_since, account_status, seller role confirmed

Updates use PATCH actions on the same function (mirroring buyer-profile pattern).

---

## Detailed Build Plan

### 1. New Edge Function: `seller-profile`

**File:** `supabase/functions/seller-profile/index.ts`

Mirrors `buyer-profile` but checks for seller role and additionally fetches:
- `payout_accounts` row for the user
- `profiles.state_name`, `profiles.city_name`, `profiles.is_region_eligible`

**GET** returns `{ profile, verification, preferences, payout_account, account_meta }`

**PATCH** supports actions:
- `update_profile` — full_name, phone, country_code, state_name, city_name
- `update_preferences` — notification toggles
- `update_avatar` — avatar_url

Payout account changes are NOT handled here — they stay on the existing `update-payout-account` function (separation of concerns).

### 2. New Service: `seller-profile.service.ts`

**File:** `src/services/seller-profile.service.ts`

```typescript
interface SellerProfile {
  id: string; full_name: string; email: string; phone: string | null;
  avatar_url: string | null; country_code: string;
  state_name: string | null; city_name: string | null; created_at: string;
}

interface SellerVerification {
  email_verified: boolean; phone_verified: boolean;
  identity_verified: boolean; payout_verified: boolean;
  is_region_eligible: boolean;
}

interface PayoutAccountSummary {
  bank_name: string | null; account_name: string | null;
  masked_account_number: string | null;
  verification_status: string; // pending | verified | failed
  last_verified_at: string | null; updated_at: string | null;
}

interface AccountMeta {
  member_since: string; account_status: string; role: string;
}

// Functions: getSellerProfile, updateSellerProfile, updateSellerPreferences, updateSellerAvatar
```

### 3. New Page: `SellerProfileSettings.tsx`

**File:** `src/pages/SellerProfileSettings.tsx`

Follows the exact same pattern as `BuyerProfileSettings.tsx`:
- Uses `useQuery` to fetch from `seller-profile`
- Tracks `pendingChanges` and `pendingPrefs` in local state
- Single Save/Cancel bar at the bottom
- `SellerNav` with Profile active
- Hero: "Profile & Settings" / "Manage your account, verification status, security, notifications, and payout destination settings."

### 4. New Component: `SellerVerificationSection`

**File:** `src/components/profile/SellerVerificationSection.tsx`

Extends the buyer version with two additional rows:
- **Payout Verification** — reads from `verification.payout_verified`
- **Region Eligibility** — reads from `verification.is_region_eligible`

States per row: Verified (green badge), Pending (yellow), Action Required (red), Not Started (gray)

Support note at bottom: "Verification helps protect payouts, dispute handling, and buyer trust."

### 5. New Component: `PayoutDestinationSection`

**File:** `src/components/profile/PayoutDestinationSection.tsx`

A read-only financial summary card:
- Title: "Payout Destination" with Wallet icon
- Shows: Bank Name, Account Name, Masked Account Number, Currency (NGN), Verification Status badge, Last Updated date
- If no account exists: empty state with "Set Up Payout Account" CTA
- If account exists: "Edit Payout Details" button
- Both buttons open the **existing** `EditPayoutDetailsModal`
- Trust note: "For security, only masked payout account details are shown. Changes to payout details may require reverification before future releases."
- Status alerts: "Verification Required", "Reverification Needed", "Payouts On Hold"

This component does NOT duplicate the modal — it imports `EditPayoutDetailsModal` from `src/components/seller/EditPayoutDetailsModal.tsx` and passes `onSave` that calls `updatePayoutAccount` from `seller-payouts.service.ts`.

### 6. New Component: `AccountStatusCard`

**File:** `src/components/profile/AccountStatusCard.tsx`

Sidebar card showing:
- Account Status (active/suspended badge)
- Role: Seller
- Member Since date
- Contextual alerts: payout verification pending, incomplete setup, region eligibility issue
- Help center link (disabled placeholder)

### 7. Route Registration

**File:** `src/App.tsx`

Add within the seller protected routes:
```
<Route path="/seller/profile" element={<SellerProfileSettings />} />
```

### 8. Config

**File:** `supabase/config.toml` — add `[functions.seller-profile]` entry.

---

## Component Reuse Map

| Component | Buyer Page | Seller Page | Changes |
|---|---|---|---|
| `PersonalInfoSection` | Used | Reused | Add state_name/city_name fields |
| `AccountVerificationSection` | Used | NOT used | Replaced by `SellerVerificationSection` |
| `SecuritySection` | Used | Reused as-is | None |
| `NotificationPreferencesSection` | Used | Reused as-is | None |
| `DangerZoneSection` | Used | Reused as-is | None |
| `TrustSafetyPanel` | Used (sidebar) | Reused as-is | None |
| `EditPayoutDetailsModal` | N/A | Imported | Already exists |
| `PayoutDestinationSection` | N/A | New | Seller-only |
| `SellerVerificationSection` | N/A | New | Seller-only |
| `AccountStatusCard` | N/A | New (sidebar) | Seller-only |

## Files Summary

| File | Action |
|---|---|
| `supabase/functions/seller-profile/index.ts` | New edge function |
| `src/services/seller-profile.service.ts` | New service |
| `src/pages/SellerProfileSettings.tsx` | New page |
| `src/components/profile/SellerVerificationSection.tsx` | New |
| `src/components/profile/PayoutDestinationSection.tsx` | New |
| `src/components/profile/AccountStatusCard.tsx` | New |
| `src/components/profile/PersonalInfoSection.tsx` | Edit — add optional state/city fields |
| `src/App.tsx` | Edit — add `/seller/profile` route |
| `supabase/config.toml` | Edit — add function config |

