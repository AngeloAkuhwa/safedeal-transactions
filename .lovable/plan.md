

# Notification Preferences — Robust Page-Level Save Implementation

## Current Issues

1. **Auto-save per toggle** — toggles fire a mutation immediately, bypassing the page-level "Save Changes" button
2. **No upsert** — edge function uses `.update()` which silently fails if no `notification_preferences` row exists
3. **No input validation** on the edge function (body could be missing `action` or malformed)
4. **No updated data returned** after PATCH — frontend can't confirm what was saved
5. **`system_alerts`** exists in the schema and service but is missing from the `NotificationPreferencesSection` UI

## Changes

### 1. Edge Function: `supabase/functions/buyer-profile/index.ts`

**`update_preferences` action improvements:**
- Switch from `.update()` to `.upsert()` keyed on `user_id` so it works even if no row exists yet
- Validate that at least one preference key is present, return 400 otherwise
- Return the saved preferences in the response so the frontend can confirm state
- Add body parsing error handling (try/catch around `req.json()`)

**`update_profile` action improvements:**
- Validate `full_name` is a non-empty string (max 100 chars) if provided
- Validate `phone` format if provided (string, max 20 chars)
- Validate `country_code` is a 2-char string if provided
- Return 400 with specific message if no valid fields provided

**General improvements:**
- Wrap `req.json()` in try/catch to handle malformed JSON gracefully
- Add `action` field validation before processing

### 2. Service Layer: `src/services/profile.service.ts`

- Add a dedicated `updateNotificationPreferencesBatch` method that sends the full preferences object (not partial) for the page-level save use case
- Improve error message extraction — check `data?.error` from edge function responses (Supabase functions.invoke returns errors in data for non-network failures)

### 3. Page: `src/pages/BuyerProfileSettings.tsx`

- Add `pendingPrefs` state (`Partial<NotificationPreferences>`)
- Update `hasPending` to include both `pendingChanges` and `pendingPrefs`
- Change `handlePrefToggle` to update `pendingPrefs` local state (no immediate mutation)
- Update `saveMutation` to run both `updateProfile` and `updateNotificationPreferences` when needed (using `Promise.all` with conditional calls)
- Pass merged preferences (`...data.preferences, ...pendingPrefs`) to the component
- Clear both `pendingChanges` and `pendingPrefs` on save success and cancel
- Remove standalone `prefsMutation`

### 4. Component: `src/components/profile/NotificationPreferencesSection.tsx`

- Add `system_alerts` to the `prefItems` array (it exists in schema and service types, just missing from UI)

## Files Modified

1. `supabase/functions/buyer-profile/index.ts` — upsert, validation, return saved data
2. `src/services/profile.service.ts` — better error handling
3. `src/pages/BuyerProfileSettings.tsx` — batch save with pendingPrefs
4. `src/components/profile/NotificationPreferencesSection.tsx` — add system_alerts toggle

