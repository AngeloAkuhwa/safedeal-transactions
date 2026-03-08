

# Cloudinary Evidence Upload with Hashing

## Overview

Build a direct-browser-upload pipeline for dispute evidence using Cloudinary signed uploads, SHA-256 hashing, and full dispute linking with ownership validation.

## Architecture

```text
User selects file
      ↓
Browser calculates SHA-256 hash
      ↓
Frontend requests signed upload params (upload-evidence → sign_upload)
      ↓
Browser uploads directly to Cloudinary (SafeDeal/disputes/{userId})
      ↓
Frontend calls upload-evidence → register_file with Cloudinary response + hash
      ↓
files table record created (file_hash, public_id, is_temporary=true)
      ↓
file_id returned, stored in component state
      ↓
User clicks "Submit Dispute"
      ↓
raiseDispute called with fileIds[]
      ↓
transaction-verify validates ownership, links dispute_evidence, emits events
```

## Implementation Steps

### 1. Add Cloudinary Secrets
Three secrets: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

### 2. Database Migration
Add `file_hash` and `hash_algorithm` columns to the existing `files` table:
```sql
ALTER TABLE public.files ADD COLUMN file_hash text;
ALTER TABLE public.files ADD COLUMN hash_algorithm text DEFAULT 'sha256';
```

### 3. New Edge Function: `upload-evidence/index.ts`

Two actions:

**`sign_upload`** — Auth required. Rate limit: count files by `uploaded_by_user_id` in last hour (max 50). Returns `{ timestamp, signature, api_key, cloud_name, folder }`. Folder: `SafeDeal/disputes/{userId}`. Uses HMAC-SHA1 to sign Cloudinary params with `CLOUDINARY_API_SECRET`.

**`register_file`** — Accepts Cloudinary response fields (`public_id`, `asset_id`, `secure_url`, `bytes`, `format`, `resource_type`, `original_filename`) plus `file_hash` and `hash_algorithm`. Validates format (jpg/png/mp4/pdf) and size (≤ 10MB). Creates `files` row with full metadata, `is_temporary: true`, `context_type: dispute_evidence`. Returns `{ file_id, secure_url, mime_type, original_file_name, fingerprint }`.

Config: `[functions.upload-evidence] verify_jwt = false` in `supabase/config.toml`.

### 4. Update `raiseDispute` in `transaction-verify/index.ts`

Current signature: `body: { reason, description }` → add `fileIds?: string[]`.

After dispute creation, before side-effect writes:
- If `fileIds` provided and non-empty (max 10):
  - Validate ownership: query `files` where `id IN (fileIds) AND uploaded_by_user_id = userId` — count must match
  - Insert `dispute_evidence` rows for each file (with `dispute_id`, `file_id`, `submitted_by_user_id`, `submitted_by_role: buyer`, `evidence_type: photo/video/document` based on mime)
  - Update files: set `is_temporary = false`
  - Emit `dispute_evidence_uploaded` event to `transaction_events`

### 5. Update `src/services/verification.service.ts`

Add `uploadEvidence(file: File)`:
1. Compute SHA-256 in browser via `crypto.subtle.digest`
2. Call `upload-evidence` with `action: "sign_upload"` → get signed params
3. POST file directly to `https://api.cloudinary.com/v1_1/{cloud_name}/auto/upload` as FormData
4. Call `upload-evidence` with `action: "register_file"` + Cloudinary response + hash
5. Return `{ file_id, secure_url, mime_type, original_file_name, fingerprint }`

Update `raiseDispute` signature: add `fileIds: string[]` parameter, pass in body.

### 6. Update `src/components/verification/DisputeForm.tsx`

Replace static upload placeholder with functional UI:
- State: `uploadedFiles[]` with `{ id, url, name, mime, status: 'uploading'|'done'|'error', fingerprint }`
- Hidden `<input type="file" multiple accept="image/jpeg,image/png,video/mp4,.pdf">` triggered by dropzone click
- Drag-and-drop handlers on zone div
- Client-side validation: size ≤ 10MB, video duration ≤ 60s (via `HTMLVideoElement`), max 10 files
- Each file uploads immediately via `uploadEvidence()` with progress indicator
- Preview grid: image thumbnails, video/PDF icons, remove button, retry on error
- Shortened fingerprint display per file (e.g. `#9A4F-BE72`)
- `canSubmit` requires all uploads in `done` state
- Passes `fileIds` to `raiseDispute`

## Files Summary

| File | Action |
|------|--------|
| Secrets | Add `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` |
| Migration | Add `file_hash` + `hash_algorithm` to `files` |
| `supabase/config.toml` | Add `[functions.upload-evidence] verify_jwt = false` |
| `supabase/functions/upload-evidence/index.ts` | New: sign + register |
| `supabase/functions/transaction-verify/index.ts` | Update `raiseDispute` to validate + link `fileIds` |
| `src/services/verification.service.ts` | Add `uploadEvidence()`, update `raiseDispute` |
| `src/components/verification/DisputeForm.tsx` | Functional upload UI |

## Security

- Cloudinary secrets server-side only
- Browser-side SHA-256 hashing
- File ownership validated before linking
- Rate limiting (50/hr per user)
- Client + server size/type validation
- Video duration cap (60s client-side)
- `is_temporary` flag for unattached file cleanup

