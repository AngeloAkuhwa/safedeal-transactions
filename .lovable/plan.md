

# Fix: Cloudinary Signature Algorithm

## Problem
Cloudinary expects `SHA1(paramsToSign + apiSecret)` but the code uses `HMAC-SHA1(apiSecret, paramsToSign)`. These are different algorithms.

## Changes

### `supabase/functions/upload-evidence/index.ts`
1. **Delete** `hmacSha1` function
2. **Add** `cloudinarySignature` function using plain SHA-1 digest:
   ```ts
   async function cloudinarySignature(apiSecret: string, paramsToSign: string): Promise<string> {
     const enc = new TextEncoder();
     const data = enc.encode(paramsToSign + apiSecret);
     const digest = await crypto.subtle.digest("SHA-1", data);
     const bytes = new Uint8Array(digest);
     return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
   }
   ```
3. **Update** `signUpload` to use sorted params object and call `cloudinarySignature` instead of `hmacSha1`

No other files need changes.

