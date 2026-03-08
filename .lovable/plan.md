

# Fix: PDF upload rejected due to Cloudinary `resource_type` mismatch

## Problem
When uploading a PDF via the `/auto/upload` endpoint, Cloudinary can return `resource_type: "image"` with `format: "pdf"` (Cloudinary treats PDFs as images since they can be rendered). The backend cross-validation rejects this because it only allows PDFs under `resource_type: "raw"`.

## Fix

### `supabase/functions/upload-evidence/index.ts`
Update the `validCombinations` map to also allow `"pdf"` under the `"image"` resource type, since Cloudinary's auto-upload classifies PDFs as images:

```ts
const validCombinations: Record<string, string[]> = {
  image: ["jpg", "jpeg", "png", "pdf"],  // Cloudinary treats PDF as image
  video: ["mp4"],
  raw: ["pdf"],
};
```

Also ensure the `resourceTypeMap` handles this correctly -- when `resource_type` is `"image"` but `format` is `"pdf"`, map to our `"raw"` enum value instead of `"image"`:

```ts
// After cross-validation passes
let mappedResourceType = resourceTypeMap[resource_type] || "raw";
if (format.toLowerCase() === "pdf") {
  mappedResourceType = "raw";  // Always store PDFs as raw in our system
}
```

### Files Changed
| File | Change |
|------|--------|
| `supabase/functions/upload-evidence/index.ts` | Allow PDF under image resource_type; normalize mapped type for PDFs |

