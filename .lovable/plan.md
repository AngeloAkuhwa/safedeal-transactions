

# Profile Photo Upload — Implementation Plan

## Summary

Enable the currently disabled "Upload New Photo" and "Remove" buttons in PersonalInfoSection with full Cloudinary upload support, upload progress indicator, and persistent avatar display on page load.

## Technical Details

### 1. New Edge Function: `upload-avatar`

**File:** `supabase/functions/upload-avatar/index.ts`

Lightweight function with two actions, following the same Cloudinary signing pattern as `upload-evidence`:

- **`sign_upload`**: Generates a Cloudinary signature for folder `SafeDeal/avatars/{userId}` with `overwrite: true` (one avatar per user). Returns `{ timestamp, signature, api_key, cloud_name, folder }`.
- **`save_avatar`**: Receives the Cloudinary response (`secure_url`, `public_id`), builds an optimized URL, updates `profiles.avatar_url` via service role, returns the new URL.

No rate limiting beyond 5 uploads/hour for avatars. Max file size enforced client-side (2MB) and via Cloudinary upload preset if desired.

### 2. Update: `PersonalInfoSection.tsx`

Remove the `disabled` prop from both buttons and add:

- **Hidden file input** (`<input type="file" accept="image/*">`) triggered by the Upload button
- **Client-side validation**: File type (jpg/png/gif/webp), max 2MB
- **Local preview**: Use `URL.createObjectURL()` for instant preview before upload completes
- **Upload progress**: Show a `Progress` bar (existing component) below the avatar during upload using `XMLHttpRequest` with `upload.onprogress`
- **Upload flow**:
  1. Call `upload-avatar` edge function with `action: "sign_upload"` to get Cloudinary credentials
  2. Upload directly to Cloudinary using `XMLHttpRequest` (for progress tracking)
  3. On success, call `upload-avatar` with `action: "save_avatar"` passing the Cloudinary response
  4. Update local state with new avatar URL, show success toast
- **Remove button**: Calls `updateSellerAvatar(null)` from seller-profile service (already exists), clears local preview
- **New props**: `onAvatarUploaded?: (url: string | null) => void` callback so the parent page can invalidate queries

### 3. Update: `SellerProfileSettings.tsx`

Pass an `onAvatarUploaded` callback to `PersonalInfoSection` that invalidates the `seller-profile` query so the nav bar avatar also updates.

### 4. Avatar Display on Page Load

Already works — the edge function returns `profile.avatar_url` from the `profiles` table, and `PersonalInfoSection` renders it via `AvatarImage`. Once we persist the Cloudinary URL to `profiles.avatar_url`, it loads automatically on every visit.

## Files Summary

| File | Action |
|---|---|
| `supabase/functions/upload-avatar/index.ts` | New edge function |
| `src/components/profile/PersonalInfoSection.tsx` | Edit — enable upload/remove, add progress bar |
| `src/pages/SellerProfileSettings.tsx` | Edit — pass onAvatarUploaded callback |

