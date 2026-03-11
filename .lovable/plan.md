

# Fix Broken Upload Thumbnails

## Root Cause
The uploaded images preview using Cloudinary thumbnail URLs (`getCloudinaryThumbnail`), which adds resize transforms to the Cloudinary URL. This can fail if the image hasn't fully propagated on Cloudinary CDN yet, or if there are delivery restrictions. The preview shows broken images with the filename as alt text.

## Fix
Use **local object URLs** (`URL.createObjectURL`) for immediate preview instead of relying on Cloudinary URLs. This is faster (instant preview, no network round-trip) and more reliable.

## Changes

### `src/pages/SellerCreateTransaction.tsx`
1. Add a `preview_url` field to the local photo/video state (extend the type or use a separate map)
2. In `handlePhotoSelect`: create `URL.createObjectURL(file)` before uploading, store it alongside the upload result
3. In `handleVideoSelect`: same approach for video preview
4. In the photo preview grid: use `preview_url` (local blob URL) instead of `getCloudinaryThumbnail(p.secure_url, ...)`
5. In `removePhoto`/`removeVideo`: call `URL.revokeObjectURL()` to clean up
6. Remove the `getCloudinaryThumbnail` import if no longer needed

This ensures thumbnails display immediately and reliably regardless of Cloudinary CDN state.

| File | Action |
|------|--------|
| `src/pages/SellerCreateTransaction.tsx` | Edit — use local blob URLs for previews |

