

# Add Upload Progress to Evidence Uploads

## Approach

Replace the `fetch()` call to Cloudinary in `verification.service.ts` with `XMLHttpRequest` to get `upload.onprogress` events, and add a progress callback parameter. Then show a progress bar on each file card during upload.

## Changes

### 1. `src/services/verification.service.ts`
- Add `onProgress?: (pct: number) => void` parameter to `uploadEvidence`
- Replace the Cloudinary `fetch()` POST with `XMLHttpRequest` wrapped in a Promise
- Hook `xhr.upload.onprogress` to call `onProgress(Math.round(loaded/total * 100))`
- SHA-256 hashing and register_file steps remain unchanged (they're fast)

### 2. `src/components/verification/DisputeForm.tsx`
- Add `progress?: number` field to `UploadedFile` interface
- Pass `onProgress` callback to `uploadEvidence()` that updates the file's `progress` state
- Replace the spinner overlay with a `Progress` bar component (from `@/components/ui/progress`) showing the percentage
- Show percentage text below the bar (e.g. "72%")
- Once complete, progress disappears and fingerprint appears as before

### Files Changed
| File | Action |
|------|--------|
| `src/services/verification.service.ts` | Add XHR-based upload with progress callback |
| `src/components/verification/DisputeForm.tsx` | Show progress bar per file during upload |

