

# Lazy Load Evidence in Dispute Detail

The only unimplemented optimization is lazy loading evidence files in dispute pages.

## Current State
`BuyerClaimSection` renders all evidence images immediately via `<img src={e.file_url}>`, which loads full-resolution assets on page load.

## Changes

### 1. Update `BuyerClaimSection.tsx`
- Replace immediate `<img>` rendering with a placeholder showing file type icon + file name
- On click/tap, expand to show the full image or open in a lightbox-style dialog
- For images: show a low-quality thumbnail using Cloudinary transforms (`w_200,h_200,c_fill,q_auto`) built from `metadata_json.public_id`, load full asset on click
- For video/PDF: show icon + file name, open in dialog on click
- Use `Dialog` component for the full-size viewer

### 2. Build thumbnail URL helper
- Small utility function: given a `file_url` that already contains `q_auto,f_auto`, insert `w_200,h_200,c_fill` for thumbnail generation
- No additional Cloudinary cost — transformations are cached automatically

### Files Changed
| File | Action |
|------|--------|
| `src/components/disputes/BuyerClaimSection.tsx` | Add thumbnail grid + click-to-expand dialog |
| `src/lib/cloudinary.ts` | New: thumbnail URL builder utility |

