

# Fix: Image thumbnail not rendering in gallery strip

## Diagnosis

In `src/lib/cloudinary.ts`, `getCloudinaryThumbnail` builds:
```
.../upload/w_128,h_128,c_fill,q_auto,f_auto/...
```
by inserting transforms **immediately after `/upload/`**. But our Cloudinary image URLs already include `q_auto,f_auto/` in the path (uploaded via the existing helper). So the resulting URL becomes:
```
.../upload/w_128,h_128,c_fill,q_auto,f_auto/v1234/abc.png
```
That actually works for Cloudinary in most cases — **but** for our PNG asset the file extension in the source URL is `.png`, and the active hero `<img>` uses the raw `secure_url` (no transform), which renders fine. The thumbnail strip uses the transformed URL — and that URL is failing to load (likely 404 / broken because the original `secure_url` already contains a transform segment, so prepending another one produces `…/upload/w_128,h_128,c_fill,q_auto,f_auto/q_auto,f_auto/v…/abc.png` which Cloudinary rejects for some assets).

In short: when the source URL already has a transform after `/upload/`, we double-stack and Cloudinary serves a broken response for images (videos work because we generate a brand-new poster URL via `getCloudinaryVideoPoster`, which strips/replaces the path correctly).

## Fix

Update `getCloudinaryThumbnail` in `src/lib/cloudinary.ts` to detect an existing transform segment right after `/upload/` and **merge** the new `w_/h_/c_fill` params into it instead of stacking a second transform segment. Algorithm:

1. Split URL at `/upload/`.
2. Look at the next path segment.
3. If it matches a Cloudinary transform pattern (contains `,` or starts with a known prefix like `q_`, `f_`, `w_`, `h_`, `c_`, `e_`, `dpr_`, etc., and is not a `v123…` version segment), **prepend** `w_{w},h_{h},c_fill,` to that existing segment.
4. Otherwise (no existing transform), insert a fresh `w_{w},h_{h},c_fill,q_auto,f_auto/` segment as today.

Also add a small `onError` fallback in `ProductMediaGallery.tsx` thumbnail `<img>` so that if the Cloudinary transform ever fails, we silently fall back to the raw `secure_url` — this guarantees thumbnails always render even for non-Cloudinary URLs or unexpected formats.

## Files touched

- `src/lib/cloudinary.ts` — rewrite `getCloudinaryThumbnail` to merge with an existing transform segment instead of stacking.
- `src/components/transactions/ProductMediaGallery.tsx` — add `onError` on the thumb `<img>` to fall back to the raw URL; also pass the raw URL as the fallback for image thumbs.

## Out of scope

- Video poster logic — already working correctly.
- Hero `<img>` rendering — already uses the raw URL and works.
- Backend/edge function changes — none needed.

