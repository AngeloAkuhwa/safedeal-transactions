

# Fix Product Media Upload + Add Progress Indicator

## Problem
The `SellerProductCreate` page sends the raw file as `FormData` directly to the `upload-evidence` edge function, which expects JSON (`req.json()`), causing a parse error and 500 response.

## Root Cause
The existing upload pipeline is a 3-step process:
1. Call `upload-evidence` with `{ action: "sign_upload" }` to get Cloudinary credentials
2. Upload file directly to Cloudinary (with XHR progress tracking)
3. Call `upload-evidence` with `{ action: "register_file" }` to register metadata

The `SellerProductCreate` page skips all of this and sends raw FormData, which the edge function can't parse as JSON.

## Solution
Reuse the existing `uploadProductFile` function from `create-transaction.service.ts` which already handles the full Cloudinary upload flow with progress tracking. Also add a `product_media` context type to the edge function so files are stored in the right Cloudinary folder.

### Changes

**1. `src/pages/SellerProductCreate.tsx`**
- Import `uploadProductFile` from `create-transaction.service.ts`
- Replace the broken `handleFileUpload` with one that calls `uploadProductFile(file, onProgress)` for each file
- Add per-file upload progress state and display a progress bar on each uploading thumbnail
- Show a local preview (`URL.createObjectURL`) immediately while uploading, then switch to the Cloudinary URL on completion

**2. `supabase/functions/upload-evidence/index.ts`**
- Add `product_media` to the `contextMap` so `sign_upload` generates the correct Cloudinary folder
- Add `product_media` handling in `registerFile` for `context_type` and `retention_category` mapping (these are enum values -- need to map to existing valid enum values: `transaction_media`)

**3. `src/services/create-transaction.service.ts`** (or new `src/services/upload.service.ts`)
- Export `uploadProductFile` so it can be imported by the product create page (it's already exported, just needs the import path)

### Upload UX
- Each file shows immediately as a local preview in the grid
- A progress bar overlays the thumbnail during upload (0-100%)
- On completion, the preview switches to the Cloudinary URL
- On failure, the thumbnail shows an error state with retry option

