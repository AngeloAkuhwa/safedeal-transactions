

# Fix: Location Update "Failed to Send Request to Edge Function"

## Root Cause

`supabase.functions.invoke("buyer-profile", { method: "PATCH", body: ... })` does not reliably send a PATCH request — the Supabase JS SDK may send POST instead. The edge function only handles GET and PATCH, so POST falls through to `405 Method not allowed`, surfaced as a generic client-side error.

## Solution

Replace `supabase.functions.invoke` with direct `fetch` calls for the PATCH operations in `profile.service.ts`. This gives full control over the HTTP method and headers.

### File: `src/services/profile.service.ts`

**Changes to `updateProfile`, `updateNotificationPreferences`, and `updateAvatar`:**

Replace each `supabase.functions.invoke("buyer-profile", { method: "PATCH", body })` call with:

```typescript
const { data: sessionData } = await supabase.auth.getSession();
const accessToken = sessionData?.session?.access_token;
if (!accessToken) throw new Error("No active session. Please sign in again.");

const response = await fetch(
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/buyer-profile`,
  {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ action: "update_profile", ...updates }),
  }
);

if (!response.ok) {
  const errBody = await response.json().catch(() => ({}));
  throw new Error(errBody?.error || `Request failed: ${response.status}`);
}
return response.json();
```

Apply the same pattern to `updateNotificationPreferences` and `updateAvatar`.

Also apply to `getBuyerProfile` (GET method) for consistency, though it may already work.

### No edge function changes needed

The backend already handles PATCH correctly — the problem is purely client-side.

### Files changed

| File | Change |
|---|---|
| `src/services/profile.service.ts` | Replace `supabase.functions.invoke` PATCH calls with direct `fetch` |

