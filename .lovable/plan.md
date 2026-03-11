

# Fix Unknown Buyer + Implement Photo/Video Uploads with Validation

## Issues Found

### 1. "Unknown Buyer" Root Cause
The `seller-transactions` edge function fetches buyer names from the `profiles` table via `transactions.buyer_id`. But when a seller creates a transaction, the buyer hasn't signed up yet — `buyer_id` is null. The buyer's name IS correctly saved in `transaction_participants` (role=buyer, display_name), but that table is never queried. **Fix**: Fall back to `transaction_participants` for buyer name/email when `buyer_id` is null.

### 2. Photo/Video Uploads — Currently Placeholder
The upload zones in Step 2 are just styled divs with no actual functionality. Need to wire in real Cloudinary uploads reusing the existing `upload-evidence` pattern.

---

## Changes

### A. Fix "Unknown Buyer" (`supabase/functions/seller-transactions/index.ts`)
- After fetching items/pricing/buyers, also query `transaction_participants` for role=buyer where `buyer_id` is null
- Use participant `display_name` and `email` as fallback when no profile exists
- This ensures seller-created transactions show the entered buyer name

### B. Implement Photo/Video Uploads (`src/pages/SellerCreateTransaction.tsx`)

**Upload State:**
- `photos: UploadedFile[]` (max 3), `video: UploadedFile | null` (max 1)
- `uploadingPhoto: boolean`, `uploadingVideo: boolean`, `photoProgress: number`, `videoProgress: number`
- Each `UploadedFile` = `{ file_id, secure_url, original_name, mime_type }`

**Photo Upload Zone:**
- Click or drag triggers hidden `<input type="file" accept="image/jpeg,image/png,image/webp" multiple>`
- Client-side validation before upload:
  - Max 3 photos total (reject if already at 3)
  - Max 5MB each
  - Validate file signature (magic bytes) for JPEG/PNG/WEBP
  - Min resolution check (at least 400x400px via Image object)
- Upload via reused Cloudinary flow: get signed params from `upload-evidence`, XHR upload with progress, register file
- Show progress bar during upload, then thumbnail preview with remove (X) button

**Video Upload Zone:**
- Click triggers hidden `<input type="file" accept="video/mp4,video/quicktime,video/webm">`
- Max 1 video, max 50MB
- Validate file signature for MP4
- Upload with progress bar, show filename + duration when done, remove button

**Step 2 Validation:**
- `validateStep(2)` now requires at least 1 photo OR 1 video uploaded
- Error: "Please upload at least one product photo or video as evidence"

**Upload Service Function (`src/services/create-transaction.service.ts`):**
- Add `uploadProductFile(file, onProgress)` that reuses the same Cloudinary signed upload flow from `verification.service.ts`
- Accepts JPEG, PNG, WEBP (photos) and MP4, MOV, WEBM (videos)
- Returns `{ file_id, secure_url, mime_type, original_name, fingerprint }`

### C. Update Edge Function to Accept File IDs (`supabase/functions/create-transaction/index.ts`)
- `save_draft` body now accepts `file_ids: string[]`
- Link uploaded files to the transaction via `transaction_files` or update `files.context_ref_id` to the transaction ID

---

## Files Summary

| File | Action |
|------|--------|
| `supabase/functions/seller-transactions/index.ts` | Fix — query `transaction_participants` as buyer name fallback |
| `src/pages/SellerCreateTransaction.tsx` | Major edit — real upload UI with progress, previews, validation |
| `src/services/create-transaction.service.ts` | Add `uploadProductFile` using Cloudinary signed upload |
| `supabase/functions/create-transaction/index.ts` | Accept `file_ids` and link to transaction |
| `supabase/functions/upload-evidence/index.ts` | Allow WEBP format + product_evidence context_type |

