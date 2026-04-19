

# Plan: Product Media Gallery (images + video, lightbox, download, keyboard nav, video poster thumbs)

## Diagnosis

DB confirms both files are linked on the buyer's transaction:
- 1 image (`image/png`)
- 1 video (`video/mp4`)

`transaction-detail` and `transaction-agreement` already return them correctly in `product_media[]`. The bug is purely UI:
- `BuyerTransactionDetail.tsx` only renders the first image and silently drops the video.
- `LockedSnapshotCard.tsx` shows images + an inline `<video>` but has no lightbox, no download, no keyboard nav.

## What we'll build

A reusable **`ProductMediaGallery`** used on:
1. `BuyerTransactionDetail.tsx` → replaces the single hero image inside the Item Details card.
2. `LockedSnapshotCard.tsx` → replaces the ad-hoc grid + video block in the Product Media card.

### Component spec (`src/components/transactions/ProductMediaGallery.tsx`)
- **Hero pane**: selected media. Image → `<img object-contain>`. Video → `<video controls preload="metadata" poster=…>` with native controls (play, seek, volume, fullscreen, PiP).
- **Thumbnail strip**: horizontal, 64×64 squares, `snap-x overflow-x-auto`. Active thumb has primary-color ring.
  - Image thumbs: the image itself (Cloudinary `w_128,h_128,c_fill` transform).
  - **Video thumbs: real Cloudinary poster frame** — append `so_1,w_128,h_128,c_fill,f_jpg` and swap extension to `.jpg` so the strip shows an actual frame from the video, plus a small Play icon overlay. No extra network call beyond the existing Cloudinary CDN fetch.
- **Action bar** (top-right of hero): two icon buttons:
  - **Download** → uses `getCloudinaryDownloadUrl` (adds `fl_attachment`) and triggers a real file save via an `<a download>` click.
  - **Fullscreen** → opens shadcn `Dialog` with the asset centered on a dark backdrop. Image: `object-contain max-h-[90vh]`. Video: `controls autoplay`.
- **Keyboard nav**: left/right arrow keys cycle through media when the gallery (or its lightbox) is focused. Dialog `Esc` already closes natively.
- **Empty state**: existing 4-tile placeholder grid.
- **Single-media case**: hides thumbnail strip, keeps action bar.

### Layout discipline (so pages don't look busy)
- Hero aspect: **16/10** on Detail page (replaces current `h-52 sm:h-64`); **square** on Agreement card to match the existing 2-col layout.
- Thumb strip has fixed max-height with `snap-x overflow-x-auto`.
- Reuses existing `bg-muted`, `border-border`, `rounded-xl` tokens — no new colors.

### Cloudinary helpers
Add to `src/lib/cloudinary.ts`:
```ts
export function getCloudinaryDownloadUrl(url: string, filename?: string): string
export function getCloudinaryVideoPoster(url: string, w?: number, h?: number): string
```
- `getCloudinaryDownloadUrl` — inserts `fl_attachment` (optionally `fl_attachment:filename`) after `/upload/`. Falls back to original URL for non-Cloudinary files.
- `getCloudinaryVideoPoster` — inserts `so_1,w_{w},h_{h},c_fill,f_jpg` and swaps the extension to `.jpg` so we get a real video poster frame from Cloudinary's CDN with no extra API call.

## Files touched

- **NEW** `src/components/transactions/ProductMediaGallery.tsx` — gallery with hero + thumb strip + lightbox dialog + download + arrow-key nav.
- `src/lib/cloudinary.ts` — add `getCloudinaryDownloadUrl` and `getCloudinaryVideoPoster`.
- `src/pages/BuyerTransactionDetail.tsx` — replace the hero block (~lines 396–434) with `<ProductMediaGallery media={product_media ?? []} title={item.title} />`. Remove the now-unused single-image derivation.
- `src/components/agreement/LockedSnapshotCard.tsx` — replace the existing image grid + inline video with `<ProductMediaGallery variant="compact" />` so the Agreement card stays the same size.

## Out of scope

- Changes to `transaction-detail` / `transaction-agreement` edge functions — already returning correct data.
- Server-side video thumbnail generation pipelines — Cloudinary's on-the-fly `so_1,…,f_jpg` transform gives us a real poster frame without any extra backend work.

