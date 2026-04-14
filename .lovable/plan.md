

# Fix Product Media Upload on Add Product Page

## Problem

The upload area's "Choose Files" button calls `e.preventDefault()` (line 320), which blocks the `<label>` from triggering the hidden file input. The upload logic and Cloudinary integration already exist and work — they're just never triggered. Additionally, there are no limits enforced for the max 3 images + 1 video requirement.

## Changes

### File: `src/pages/SellerProductCreate.tsx`

1. **Fix the button blocking the file input** — Remove `onClick={(e) => e.preventDefault()}` from the "Choose Files" button (line 320). Change it to a `<span>` styled as a button, or simply remove the `preventDefault`. Since the button is inside a `<label>`, clicking it should naturally trigger the file input.

2. **Enforce max 3 images + 1 video** — Add validation in `handleFileUpload`:
   - Count current images and videos in `files` state
   - Reject new files that would exceed 3 images or 1 video
   - Show a toast error when limits are hit
   - Disable/hide the "Add More" tile when limits are reached

3. **Update the upload area text** — Change helper text from "PNG, JPG, MP4 up to 10MB each" to "Max 3 images + 1 video · PNG, JPG, MP4 up to 10MB each"

No backend or edge function changes needed — the existing `uploadProductFile` and `upload-evidence` function handle everything correctly.

