

# Fix Avatar Upload: Proper Remove + Cache-Busting

## Problem

1. **"Remove" only clears the database** — the photo remains on Cloudinary, wasting storage
2. **Same URL after re-upload** — since the public_id is always `avatar`, the URL never changes. The browser/CDN caches the old image, so after uploading a new photo you still see the old one (or fallback initials if it was previously removed from DB but not Cloudinary)

## Solution

### 1. Edge function: `upload-avatar/index.ts`

**`remove_avatar` action** — add Cloudinary destroy API call before clearing DB:
- Call `https://api.cloudinary.com/v1_1/{cloud_name}/image/destroy` with signed params to delete the asset from Cloudinary
- Then set `avatar_url = null` in profiles table

**`save_avatar` action** — append a cache-busting version timestamp to the saved URL:
- Store URL as `.../{public_id}?v={timestamp}` so the browser treats each upload as a new image and never serves a stale cached version

**`sign_upload` action** — add `invalidate: "true"` to the signing params so Cloudinary CDN also purges its cache for the old asset

### 2. Client component: `PersonalInfoSection.tsx`

- Add `formData.append("invalidate", "true")` in the XHR upload to match the signing params
- No other changes needed — the cache-busting `?v=` in the URL from the edge function handles browser caching automatically

## Files Changed

| File | Change |
|---|---|
| `supabase/functions/upload-avatar/index.ts` | Add Cloudinary destroy in `remove_avatar`; add `invalidate` to signing; add `?v=` cache-buster to saved URL |
| `src/components/profile/PersonalInfoSection.tsx` | Add `invalidate` field to XHR FormData |

