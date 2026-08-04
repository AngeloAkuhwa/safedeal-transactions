# Batch 1 — P0 security + money fixes

Six items. Design system, layouts and existing admin work stay untouched; every change reuses existing services, components and permission patterns.

## Verified current state (read before planning)

- `public.profiles` policies today: `anon_select_public_profile_info` for role `anon` with qual `store_slug IS NOT NULL` (row-level only → `email`, `phone`, `public_user_id`, `status`, `last_login_at` of every storefront seller are readable with the anon key), plus `users_select_own_profile`, `users_update_own_profile`, `admins_select_all_profiles`.
- `public-storefront` and `public-product-detail` edge functions use the **service role** client, not anon — so dropping the anon policy does not affect them.
- `transaction_status` enum real values: `draft, awaiting_buyer, awaiting_payment, payment_secured, seller_preparing_delivery, seller_dispatched, delivered_awaiting_verification, completed, disputed, cancelled, timed_out, resolved, refunded`. `awaiting_fulfillment`, `in_transit`, `delivered`, `awaiting_buyer_confirmation` do **not** exist.
- `transaction_pricing` already carries the canonical `seller_payout_amount` and `platform_fee_amount`; `src/lib/pricing.ts` exposes `platform_fee_amount` and `service_fee_amount`.
- Messaging is **not** a route: `MessageThread` renders inline on `SellerTransactionDetail.tsx:637` under an `#messages` anchor. `/seller/transactions/:id/messages` is not in `App.tsx`.
- `email_verified` is sourced from `auth.users.email_confirmed_at` in `buyer-profile` / `seller-profile` and is display-only; no checkout function checks it. Exact unconfirmed-user counts could not be read from this session (no `auth` schema access) — measuring them is Step 0 of item 2.

---

## Item 1 — Seller PII leak (P0)

**Column allowlist (public-safe):** `id`, `public_user_id`, `full_name`, `avatar_url`, `store_slug`, `city_name`, `state_name`, `country_code`, `vendor_status`. Explicitly excluded: `email`, `phone`, `status`, `last_login_at`, `default_role`, `default_region_id`, `is_region_eligible`, `vendor_status_reason/changed_at/changed_by`, timestamps.

**Approach:** migration creates `public.public_seller_profiles` view (`security_invoker = off`, i.e. a definer-style view owned by postgres) selecting only the allowlist `WHERE store_slug IS NOT NULL AND vendor_status = 'active'`; `GRANT SELECT` to `anon` and `authenticated`; then `DROP POLICY anon_select_public_profile_info ON public.profiles`. Authenticated own/admin policies are untouched.

**Consumers to repoint:** verified list — the two public edge functions already use the service role and need no change; client-side reads (`useBuyerIdentity`, `SellerTransactionAgreement`, `role.service`, seller/admin services) all run authenticated under `users_select_own_profile` / admin policy and are unaffected. Any remaining anon-context read found during implementation (storefront header, marketplace card seller block) is repointed to the new view.

**Risk:** a public surface silently loses seller name/avatar if an anon read exists that I have not enumerated. Mitigation: before dropping the policy, run a repo-wide grep for unauthenticated `profiles` reads and load `/store/:slug` and `/store/:slug/:product` signed-out in the browser.

**Rollback:** re-create the dropped policy verbatim (kept in the migration comment).

**Tests/verification:** a test asserting the view's column set equals the allowlist; a live anon REST read of `profiles?select=email,phone` with the anon key must return `[]`/permission denied, captured in the report.

## Item 2 — Server-side email verification gate (P0)

**Step 0 (report first, no code):** service-role query counting `auth.users` with `email_confirmed_at IS NULL`, split by whether they have non-terminal transactions or cart items. Result decides the rollout switch below; if the count is material I will report before enforcing.

**Enforcement:** in `create-transaction`, `cart-checkout`, `storefront-checkout`, `initiate-paystack-payment`, after the existing JWT validation, read `email_confirmed_at` from the authenticated user and, when null, return `403 { error: "email_not_verified" }`. Enforcement applies at **transaction creation / payment initiation only** — existing in-flight transactions (delivery, verification, disputes, payouts) are never gated, so no user is locked out mid-flow. Gate is read from an existing `system_settings` key so it can be switched off without a deploy.

**UI:** map `email_not_verified` in the affected services to a friendly inline alert (existing `Alert` + `Button` styling) with "Resend verification email" calling the existing Supabase resend path — no raw 403 text, no new page.

**Risk:** legitimate users blocked at checkout. Mitigation: settings flag + resend path + Step 0 measurement.
**Rollback:** flip the settings flag off.
**Tests:** unit tests for the gate helper (confirmed → pass, unconfirmed → `email_not_verified`), and a UI test that the error renders the resend affordance.

## Item 3 — F4 buyer dashboard dead enum literals

`supabase/functions/buyer-dashboard/index.ts:105-117` → `awaiting_delivery` counts `seller_preparing_delivery` + `seller_dispatched`; `awaiting_verification` counts `delivered_awaiting_verification` only. Add a shared `TRANSACTION_STATUSES` constant in `supabase/functions/_shared/` plus a test that fails when any filtered literal is not a member — regression guard.
Risk: low (counts change to correct values). Rollback: revert file. Verification: compare dashboard counts against a direct SQL group-by.

## Item 4 — F5 seller net understated

`SellerCreateTransaction.tsx:362` currently hand-computes `item_amount - service_fee_amount`. Change to consume the canonical seller payout from the pricing layer (`seller_payout_amount` / `item_amount - platform_fee_amount`) so the success screen matches the figures at :709 and :845. No new math introduced in the component.
Risk: low, display-only. Test: pricing unit test asserting the success-screen value equals the canonical payout for a capped and an uncapped tier.

## Item 5 — B1 dead route in completion flow

`SellerConfirmCompletionCard.tsx:134` → navigate to `/seller/transactions/${transactionId}#messages`, the existing inline `MessageThread` anchor on seller transaction detail. No new route, so `App.tsx` / `BUILT_ROUTES` / `admin-route-permissions` stay in lockstep untouched.
Risk: none beyond scroll-anchor behaviour. Test: assert the button's target path matches a route registered in `App.tsx`.

## Item 6 — Legal at signup + checkout

`Auth.tsx:159-163`: replace the prose with the same sentence containing inline `Link`s to `/legal/terms` and `/legal/privacy`. **Recommendation: explicit checkbox consent at signup** rather than clickwrap-by-signup — Nigerian consumer-payment and NDPA practice favours a recorded affirmative act, and it gives an auditable timestamp. The signup submit stays disabled until checked; wording: "I agree to SafeDeal's Terms of Service and Privacy Policy." Consent timestamp is recorded only if a suitable existing column/table exists; otherwise the plan records consent via the existing audit/event path rather than adding schema.
Checkout: add a one-line terms/privacy link footer to `StorefrontCheckout` and `CartCheckoutReview`, matching existing muted-foreground styling.
Risk: signup friction / a blocked submit. Tests: signup form test (submit disabled unblocked by checkbox), and link-integrity assertions that both legal paths resolve to registered routes.

---

## Sequencing and independence

- **Independent, shippable alone:** items 3, 4, 5, 6.
- **Must ship together:** item 1's view creation + consumer repoint + policy drop are a single migration/deploy unit (never drop the policy before the view is live).
- **Item 2** ships after its Step 0 measurement is reported and accepted.

## Verification for the whole batch

Full vitest suite + typecheck green, anon PII read proven denied, signed-out storefront pages loading, buyer dashboard counts matched against SQL.
