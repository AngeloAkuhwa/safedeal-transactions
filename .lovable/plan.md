## Problem

The "Couldn't load dispute — JWT expired" screen happens because services across the app read the cached session with `supabase.auth.getSession()` and pass `session.access_token` directly into edge function `Authorization` headers. If the access token has expired (e.g. tab was idle past the 1-hour lifetime), Supabase's background auto-refresh may not have run yet, so the stale token is sent and the edge function rejects with `JWT expired`. There is no retry.

## Fix

Introduce a single token helper and use it everywhere we manually attach `Authorization: Bearer ...`.

### 1. New helper: `src/lib/auth-token.ts`

- `getValidAccessToken()`:
  1. Call `supabase.auth.getSession()`.
  2. If no session → redirect to `/auth` (preserve current location in `sessionStorage.safedeal_redirect`) and return never.
  3. If `session.expires_at` is in the past or within a 60-second skew window, call `supabase.auth.refreshSession()`. If refresh fails → sign out + redirect to `/auth`.
  4. Return the fresh `access_token`.
- `authedFetch<T>(invoke)`: small wrapper that runs an async fn requiring a token, and if it throws with status 401 / message includes `JWT expired` / `invalid_session`, force-refreshes once and retries. After a second failure, signs out and redirects to `/auth`.

### 2. Replace usage in all service/component files

Every file in the rg list above currently does:
```ts
const { data: { session } } = await supabase.auth.getSession();
... headers: { Authorization: `Bearer ${session.access_token}` }
```
Switch to:
```ts
const token = await getValidAccessToken();
... headers: { Authorization: `Bearer ${token}` }
```
and wrap the `supabase.functions.invoke(...)` call (or `fetch` call) in `authedFetch(() => …)` so a stale-token 401 triggers one refresh + retry transparently.

Files touched (no behavior changes beyond token handling):
- All ~30 files in `src/services/*.service.ts` that call `supabase.functions.invoke` with manual headers
- `src/components/transactions/MessageThread.tsx`, `ContactSellerModal.tsx`
- `src/components/seller-disputes/SellerEvidenceSection.tsx`, `SellerResponseForm.tsx`
- `src/components/seller/RiderLinkCard.tsx`
- `src/hooks/useSavedProducts.ts`
- `src/pages/CartCheckoutReview.tsx`

### 3. Keep client config unchanged

`src/integrations/supabase/client.ts` already has `autoRefreshToken: true` and `persistSession: true`. We leave it alone (auto-generated file). The helper closes the gap between "token expired" and "next background refresh tick".

### 4. No backend / edge function changes

Edge functions already validate via `getUser(token)`; once the client sends a fresh token, they succeed. No DB or function code changes.

## Scope

UI/service layer only. Pure plumbing — no UX changes other than the JWT-expired error screen no longer appearing under normal conditions. Admin Dispute Detail page in particular benefits because both `admin-dispute-detail` and `admin-transaction-detail` invocations now refresh-on-demand.
