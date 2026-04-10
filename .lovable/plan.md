

# Fix Avatar Photo Display — Doubled Cloudinary Path

## Problem

In `supabase/functions/upload-avatar/index.ts`, the `sign_upload` action sets:
- `folder = SafeDeal/avatars/{userId}`
- `public_id = SafeDeal/avatars/{userId}/avatar`

When both are sent to Cloudinary, the file gets uploaded to `SafeDeal/avatars/{userId}/SafeDeal/avatars/{userId}/avatar` (doubled). But the `save_avatar` action builds the display URL using the non-doubled path, which is a 404.

## Fix

**File:** `supabase/functions/upload-avatar/index.ts`

In the `sign_upload` action, set `public_id` to just `avatar` (without the folder prefix), since the `folder` parameter already handles the path. The signing params should be:

```
folder: "SafeDeal/avatars/{userId}"
public_id: "avatar"           // NOT "SafeDeal/avatars/{userId}/avatar"
```

And update the response to return `public_id` as the full path (`folder/avatar`) so the `save_avatar` action can still build the correct optimized URL.

**File:** `src/components/profile/PersonalInfoSection.tsx`

Remove the `formData.append("public_id", public_id)` line from the XHR upload, since when `folder` is provided to Cloudinary, the `public_id` should be relative (just `avatar`). Alternatively, send only `public_id` without `folder` in the FormData — we just need to avoid the double-nesting.

## Files Changed

| File | Action |
|---|---|
| `supabase/functions/upload-avatar/index.ts` | Fix public_id to not include folder prefix |
| `src/components/profile/PersonalInfoSection.tsx` | Align FormData fields with corrected signing params |

