

# Fix: PATCH "Failed to fetch" on buyer-profile edge function

## Root Cause

The `corsHeaders` object in `supabase/functions/buyer-profile/index.ts` is missing the `Access-Control-Allow-Methods` header. Browsers require this header in the preflight OPTIONS response to permit non-simple HTTP methods like PATCH. Without it, the browser blocks the PATCH request entirely, resulting in a "Failed to fetch" error on the client.

## Fix

**File: `supabase/functions/buyer-profile/index.ts`**

Add `Access-Control-Allow-Methods` to `corsHeaders`:

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};
```

Single line addition. No other files need changes.

