

# Cloudinary Evidence Upload with Hashing — Implementation Plan

All three Cloudinary secrets are confirmed saved. Here's the implementation plan.

## Step 1: Database Migration

Add `file_hash` and `hash_algorithm` columns to `files` table:

```sql
ALTER TABLE public.files ADD COLUMN file_hash text;
ALTER TABLE public.files ADD COLUMN hash_algorithm text DEFAULT 'sha256';
```

Also duplicate to `src/db/migrations/015_file_hash_columns.sql` per project convention.

## Step 2: New Edge Function — `upload-evidence/index.ts`

Single file at `supabase/functions/upload-evidence/index.ts` with two actions:

**`sign_upload`**: Authenticates user via JWT, counts recent uploads (rate limit 50/hr), generates HMAC-SHA1 signature using `CLOUDINARY_API_SECRET` for params `{ timestamp, folder: "SafeDeal/disputes/{userId}" }`, returns `{ timestamp, signature, api_key, cloud_name, folder }`.

**`register_file`**: Accepts Cloudinary response fields + `file_hash` + `hash_algorithm`. Validates format (jpg/jpeg/png/mp4/pdf) and size (≤ 10MB from `bytes`). Creates `files` row with service role client (bypasses RLS):
- `provider: 'cloudinary'`, `provider_asset_id: asset_id`
- `resource_type` mapped from Cloudinary response
- `file_url` built from public_id with `q_auto,f_auto` transforms
- `secure_url` from response
- `context_type: 'dispute_evidence'`, `retention_category: 'dispute_evidence'`
- `is_temporary: true`, `file_hash`, `hash_algorithm`
- `metadata_json: { public_id }` for dynamic URL construction
- Returns `{ file_id, secure_url, mime_type, original_file_name, fingerprint }` where fingerprint is first 8 chars of hash formatted as `#XXXX-XXXX`

Add to `supabase/config.toml`:
```toml
[functions.upload-evidence]
verify_jwt = false
```

## Step 3: Update `raiseDispute` in `transaction-verify/index.ts`

Update the `raiseDispute` function (line 437-611):
- Extract `fileIds` from body (optional `string[]`)
- After dispute creation (line 522), if `fileIds` provided:
  - Validate max 10 files
  - Validate ownership: query `files` where `id IN (fileIds) AND uploaded_by_user_id = userId`, count must match
  - Map each file's `resource_type` to evidence_type (`image→photo`, `video→video`, `raw/document→document`)
  - Insert `dispute_evidence` rows with `dispute_id`, `file_id`, `submitted_by_user_id: userId`, `submitted_by_role: 'buyer'`, `evidence_type`
  - Update files: set `is_temporary = false`
  - Add `dispute_evidence_uploaded` event to the parallel side-effect writes

## Step 4: Update `src/services/verification.service.ts`

Add `uploadEvidence(file: File)`:
1. Compute SHA-256 via `crypto.subtle.digest` on file ArrayBuffer, convert to hex
2. Call `upload-evidence` with `action: "sign_upload"` via `supabase.functions.invoke`
3. POST file as FormData directly to `https://api.cloudinary.com/v1_1/{cloud_name}/auto/upload` with signed params
4. Call `upload-evidence` with `action: "register_file"` + Cloudinary response fields + hash
5. Return `{ file_id, secure_url, mime_type, original_file_name, fingerprint }`

Update `raiseDispute` to accept optional `fileIds: string[]` and pass in body.

## Step 5: Update `src/components/verification/DisputeForm.tsx`

Replace the static upload placeholder with functional UI:
- State: `uploadedFiles[]` tracking `{ id, url, name, mime, status, fingerprint }`
- Hidden `<input type="file" multiple>` with accept `image/jpeg,image/png,video/mp4,.pdf`
- Dropzone with `onDragOver`/`onDrop` handlers
- Client-side validation: size ≤ 10MB, video duration ≤ 60s (via temp `HTMLVideoElement`), max 10 files
- Each file calls `uploadEvidence()` immediately, shows spinner per file
- Preview grid: image thumbnails via `URL.createObjectURL`, video/PDF icons, remove button, retry on error
- Shortened fingerprint badge per file (e.g. `#9A4F-BE72`)
- `canSubmit` requires reason + description ≥ 20 chars + all uploads done (0 files is OK)
- Passes `uploadedFiles.map(f => f.id)` to `raiseDispute`

## Files Changed

| File | Action |
|------|--------|
| Migration | Add `file_hash` + `hash_algorithm` to `files` |
| `src/db/migrations/015_file_hash_columns.sql` | Mirror migration |
| `supabase/config.toml` | Add `upload-evidence` config |
| `supabase/functions/upload-evidence/index.ts` | New edge function |
| `supabase/functions/transaction-verify/index.ts` | Update `raiseDispute` for `fileIds` |
| `src/services/verification.service.ts` | Add `uploadEvidence()`, update `raiseDispute` |
| `src/components/verification/DisputeForm.tsx` | Functional upload UI |

