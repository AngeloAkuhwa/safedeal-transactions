

# Buyer Profile & Settings -- Corrected Implementation Plan

## Schema Corrections

The user's prompt references tables and columns that do not exist. Here are the corrections based on the actual database schema:

| Prompt says | Actual schema |
|---|---|
| `profiles.first_name`, `last_name`, `display_name` | `profiles.full_name` (single field) |
| `profiles.phone_number` | `profiles.phone` |
| `profiles.avatar_file_id` | `profiles.avatar_url` (direct URL string) |
| `profiles.date_of_birth` | Does not exist |
| `user_notification_preferences` | `notification_preferences` |
| `user_verifications` with `verification_status`, `verification_level` | `account_verifications` with boolean fields: `email_verified`, `phone_verified`, `identity_verified`, `payout_verified` |
| `transaction_updates` column | `payment_updates` |
| `marketing_emails` column | `marketing_messages` |

No database migration needed. All tables exist with correct RLS policies already in place.

## 1. Edge Function: `supabase/functions/buyer-profile/index.ts`

Same auth pattern as `buyer-dashboard`: Bearer token, `adminClient.auth.getUser(token)`, `has_role(userId, 'buyer')`.

**GET**: Fetches three tables via `Promise.allSettled`:
- `profiles`: `id, full_name, email, phone, avatar_url, country_code, created_at`
- `notification_preferences`: `payment_updates, delivery_updates, dispute_updates, verification_reminders, system_alerts, marketing_messages`
- `account_verifications`: `email_verified, phone_verified, identity_verified, payout_verified`

**PATCH** (by `action` field in body):
- `update_profile`: Updates `profiles` → `full_name, phone, country_code`
- `update_preferences`: Updates `notification_preferences` toggles
- `update_avatar`: Updates `profiles.avatar_url`

Response shape:
```json
{
  "profile": {
    "id": "", "full_name": "", "email": "", "phone": "",
    "avatar_url": "", "country_code": "", "created_at": ""
  },
  "verification": {
    "email_verified": true, "phone_verified": true,
    "identity_verified": false, "payout_verified": false
  },
  "preferences": {
    "payment_updates": true, "delivery_updates": true,
    "dispute_updates": true, "verification_reminders": true,
    "system_alerts": true, "marketing_messages": false
  }
}
```

## 2. Service Layer: `src/services/profile.service.ts`

Replace current file. Methods:
- `getBuyerProfile()` -- invokes `buyer-profile` (GET-like, no body needed)
- `updateProfile(data)` -- invokes with `action: 'update_profile'`
- `updateNotificationPreferences(data)` -- invokes with `action: 'update_preferences'`
- `updateAvatar(avatarUrl)` -- invokes with `action: 'update_avatar'`
- `changePassword(newPassword)` -- `supabase.auth.updateUser({ password })` directly

## 3. Page: `src/pages/BuyerProfileSettings.tsx`

Matching the HTML design screenshots. Uses `useQuery(["buyer-profile"])`.

Layout:
- BuyerNav
- Hero banner ("Profile & Settings" + subtitle)
- 2-column grid (`lg:grid-cols-3`): left `lg:col-span-2`, right `lg:col-span-1`
  - Left: PersonalInfoSection, AccountVerificationSection, SecuritySection, NotificationPreferencesSection, DangerZoneSection, Save/Cancel buttons
  - Right: TrustSafetyPanel (sticky)
- Footer

## 4. Components

### `src/components/profile/PersonalInfoSection.tsx`
- Avatar with Upload/Remove buttons (photo upload updates `profiles.avatar_url`)
- Full Name (editable input)
- Email (read-only with verified check from `verification.email_verified`)
- Phone (editable with verified check from `verification.phone_verified`)

### `src/components/profile/AccountVerificationSection.tsx`
Rows from `account_verifications` booleans:
- Email Verified (green badge or pending)
- Phone Verified (green badge or pending)
- Identity Verification (pending badge, "Complete Verification" button -- placeholder for MVP)

### `src/components/profile/SecuritySection.tsx`
List items matching design:
- Change Password (expandable/modal with new+confirm fields, uses `changePassword()`)
- Two-Factor Authentication (Disabled badge, informational for MVP)
- Login Sessions (informational for MVP)
- Security Alerts (toggle, informational for MVP)

### `src/components/profile/NotificationPreferencesSection.tsx`
Toggle switches for each `notification_preferences` column:
- Payment Updates, Delivery Updates, Dispute Updates, Verification Reminders, Marketing Messages
- Each toggle updates via `updateNotificationPreferences()`

### `src/components/profile/DangerZoneSection.tsx`
- Deactivate Account / Delete Account rows (placeholder confirmation dialogs, no backend action for MVP)

### `src/components/profile/TrustSafetyPanel.tsx`
Right sidebar card with trust info items. "Learn More" button (informational).

## Files to Modify

### `src/App.tsx`
Add route in buyer-protected group:
```tsx
<Route path="/dashboard/profile" element={<BuyerProfileSettings />} />
```

### `supabase/config.toml`
```toml
[functions.buyer-profile]
verify_jwt = false
```

## No database migration needed

