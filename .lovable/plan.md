

# Fix Cloudinary Signature + Add File Validation

## Changes

### 1. `supabase/functions/upload-evidence/index.ts`
- Fix `hmacSha1` to return **hex-encoded** signature instead of Base64
- Replace `btoa(String.fromCharCode(...))` with `Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')`

### 2. `src/services/verification.service.ts`
- Add `detectFileSignature()` function that reads the first 16 bytes of a file to verify magic bytes (JPEG: `FF D8 FF`, PNG: `89 50 4E 47`, PDF: `%PDF`, MP4: `ftyp` at offset 4)
- Call it at the start of `uploadEvidence()` before hashing or uploading — reject unknown/suspicious files early

### 3. `supabase/functions/upload-evidence/index.ts` (register_file)
- Add cross-validation: ensure Cloudinary `resource_type` matches `format` (e.g. image must be jpg/jpeg/png, video must be mp4, raw must be pdf)
- Reject mismatches before inserting the file record

### Files Changed
| File | Change |
|------|--------|
| `supabase/functions/upload-evidence/index.ts` | Fix hex signature, add resource_type/format cross-validation |
| `src/services/verification.service.ts` | Add magic-byte file validation before upload |

