
Fix this as a debugging + hardening pass, not just a UI patch.

1. Confirm the real failure path
- The current review page turns every failure into the same fallback: “Session not found”.
- I’ll update it to preserve and display the real backend error state:
  - Unauthorized
  - Forbidden / wrong account
  - Missing session id
  - Actual session not found
  - Generic load failure

2. Harden the frontend checkout-review request
- In `src/pages/CartCheckoutReview.tsx`, replace the manual project-id function URL with the same backend base pattern used elsewhere (`VITE_SUPABASE_URL` or a small service wrapper).
- Keep the created `checkout_session_id` in route params as now, but also store it temporarily in session storage as a fallback in case redirect/query handling is inconsistent.
- Add console logging for:
  - session id being requested
  - response status
  - backend error body

3. Make the review screen resilient to account mismatch
- Right now a 401/403/500 can still look like “Session not found”.
- I’ll add proper empty/error states so if the user opens the flow under the wrong signed-in account, the page explicitly says they must continue as the buyer account that created the checkout.

4. Add backend diagnostics to both functions
- `supabase/functions/cart-checkout/index.ts`
  - log created `checkout_session_id`
  - log buyer id and selected cart items count
- `supabase/functions/checkout-review/index.ts`
  - log received `session_id`
  - log authenticated user id
  - log whether the session row exists
  - log whether ownership check failed
- This will let us distinguish:
  - session was never created
  - session id was lost
  - wrong user opened it
  - function endpoint/deployment mismatch

5. Keep the current backend model
- No database migration is needed for this fix.
- The existing checkout session tables already have the needed buyer-scoped policies, and the review function is already using backend-level access, so this is not primarily an RLS-schema problem.

6. Small cleanup while fixing
- Ensure the review page does not silently swallow malformed enriched data.
- If needed, normalize seller/product enrichment so missing image/profile fields don’t break the session load experience.

Files to update
- `src/pages/CartCheckoutReview.tsx`
- optionally `src/services/checkout-review.service.ts` for a cleaner fetch wrapper
- `supabase/functions/checkout-review/index.ts`
- `supabase/functions/cart-checkout/index.ts`

Validation after implementation
- Public storefront → add to cart → view cart → checkout selected → review page loads
- Same flow with a wrong/non-buyer account shows a clear account-mismatch message
- Session id is visible in logs from creation through review lookup
- Review page no longer shows “Session not found” for unrelated errors
