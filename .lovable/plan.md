# Batch 3 — legal/support surfaces, public SEO, pricing parity, ledger hygiene

Standing rules apply: no redesigns, reuse existing components and patterns, admin + Batch 1 + Batch 2 work untouched, all tests stay green, route-sync files (`App.tsx`, `src/__tests__/admin-routes.smoke.test.tsx`) updated in lockstep with any new route.

Split by approval:

- **Safe to auto-apply on approval of this plan:** Items 1, 2, 3, 4.
- **Report-first, no writes until you approve the evidence:** Items 5 and 6 (money data), plus the admin-facing ledger code fix in Item 5.

---

## Item 1 — Refund & dispute policy page

New public page `/legal/refund-policy`, built as a direct copy of the `LegalTerms.tsx` / `LegalPrivacy.tsx` structure (same `useEffect` title/description handling, same "Back to SafeDeal" link, same bordered placeholder notice, same section rhythm).

Sections: how escrow protection works, when a refund happens (cancelled before payment, seller non-delivery, dispute resolved for buyer), what is non-refundable (service fees), how to open a dispute, response and resolution timelines, and how released funds are treated.

Links added (no layout changes, matching the existing inline `<Link>` treatment already used for Terms/Privacy):

- `StorefrontCheckout.tsx` and `CartCheckoutReview.tsx` — appended to the existing consent line.
- Dispute-open surface (`BuyerTransactionVerify.tsx` dispute form) — one small "Read the refund & dispute policy" link.
- Landing footer support column.

Files: `src/pages/LegalRefundPolicy.tsx` (new), `src/App.tsx`, `src/components/landing/Footer.tsx`, `src/pages/StorefrontCheckout.tsx`, `src/pages/CartCheckoutReview.tsx`, `src/pages/BuyerTransactionVerify.tsx`, `src/__tests__/admin-routes.smoke.test.tsx` (mount case).

Risk: very low (additive). Rollback: delete page + revert 5 link edits. Verification: mount test, link extraction shows the route resolves. Independent of every other item.

## Item 2 — Contact / support page

New public page `/contact` in the same minimal legal-page style. Content: support email (placeholder, clearly marked for the owner to replace), expected response window (placeholder, e.g. 1 business day), a "transaction problem?" block pointing at the dispute flow and the new refund policy, and operating hours. No form, no ticketing, no backend.

Footer "Help Center" and "Contact Us" both become links to `/contact` (they are currently non-clickable spans after the Batch 2 dead-link cleanup).

Files: `src/pages/Contact.tsx` (new), `src/App.tsx`, `src/components/landing/Footer.tsx`, smoke-test mount case.

Risk: very low. Rollback: delete page, revert footer. Independent.

## Item 3 — SEO for public pages only

**(a) Reusable head hook.** New `src/hooks/usePageMeta.ts` — one `useEffect` that sets `document.title`, `meta[name=description]`, `link[rel=canonical]`, and the `og:*` / `twitter:*` tags, creating tags when absent and restoring previous values on unmount. No new dependency; this is the same technique `LegalTerms`/`LegalPrivacy` already use, generalised. Those two pages are refactored onto it.

Applied to public routes only: landing (`Index`), `/marketplace`, `/store/:sellerSlug`, `/store/:sellerSlug/:productSlug`, `/legal/*`, `/contact`. Buyer, seller and admin app screens are out of scope.

**(b) Dynamic meta.** Storefront: title from store name, description from store bio/tagline, `og:image` from the store logo. Product: title `"<product> — <store> | SafeDeal"`, description from the product description (truncated ~155 chars), `og:image` from the first product media. Fallbacks to SafeDeal defaults whenever data is loading or missing.

**(c) Defaults in `index.html`.** Replace `https://lovable.dev/opengraph-image-p98pqg.png` and `twitter:site` `@Lovable`. Planned source: the existing `src/assets/safedeal-logo.png` copied to `public/og-default.png` and referenced as an absolute URL on the project domain (crawlers require absolute). The logo is square, not 1200x630 — it will render as a small centred preview. If you want a proper 1200x630 card I will generate one instead; say which. `twitter:site` is removed rather than invented, since SafeDeal has no confirmed handle.

**(d) Sitemap.** Static `public/sitemap.xml`, hand-written, listing only public routes: `/`, `/marketplace`, `/legal/terms`, `/legal/privacy`, `/legal/refund-policy`, `/contact`. Build-time generation is deliberately not chosen: the only high-volume dynamic surfaces (stores, products) would need a build-time DB fetch, which is out of scope for this batch. No `<lastmod>` values (no authoritative per-page timestamp). A `Sitemap:` directive is added to `public/robots.txt`, keeping every existing user-agent block intact.

**(e) JSON-LD.** `Product` structured data injected on `/store/:sellerSlug/:productSlug` (name, description, image, `offers` with NGN price and availability derived from the existing stock fields), via the same hook's script-tag path, removed on unmount. Low risk: inert markup, no layout impact.

**SPA limitation — stated plainly.** This app is a static Vite SPA. Everything in (a), (b), (e) is set by JavaScript after mount. Google's renderer executes JS and will generally see it. Social crawlers (Facebook/LinkedIn/Slack/X unfurls) do **not** execute JS — they will only ever see the static `index.html` head. So this package **solves**: per-page titles/descriptions/canonicals for search engines, correct sitemap and robots, a non-Lovable default social card, product structured data. It **does not solve**: per-page social previews, or non-JS crawlers seeing page content. A proper fix requires prerendering or SSR (migrating to the TanStack Start template, or a build-time prerender step) — explicitly **not** attempted in this batch.

Files: `src/hooks/usePageMeta.ts` (new), `index.html`, `public/robots.txt`, `public/sitemap.xml` (new), `public/og-default.png` (new), `src/pages/Index.tsx`, `BuyerMarketplace.tsx`, `PublicStorefront.tsx`, `PublicProductDetail.tsx`, `LegalTerms.tsx`, `LegalPrivacy.tsx`, plus the two new pages.

Risk: low; the only shared-surface edit is `index.html`. Rollback: revert the hook and the head tags. Verification: new unit test asserting the hook sets and restores tags, plus a browser check of `document.head` on a storefront route.

## Item 4 — Pricing parity test (C2)

The two modules are near-identical, but the server one additionally supports `mode: "local" | "international"` and keeps tier rates in a function rather than a table. Merging them is rejected: `src/lib/pricing.ts` is bundled by Vite and `supabase/functions/_shared/pricing.ts` is loaded by Deno from the functions directory, which cannot import from `src/`. A shared module would mean duplicating the file into `supabase/functions/_shared` anyway.

Approach: a new Vitest file `src/__tests__/pricing-parity.contract.test.ts` that imports the client module normally and the Deno module by relative path (plain TypeScript, no Deno APIs in it, so Vitest loads it directly), then asserts:

1. `computePricing(amount)` (client) deep-equals `computePricing(amount, "NGN", "local")` (server) across a fixed amount table: 0, 1, 999, 2_499, 2_500, 50_000, 99_999, 100_000, 100_001, 500_000, 500_001, 2_000_000, 2_000_001, 5_000_000, plus each cap/floor boundary amount and a set of pseudo-random amounts from a fixed seed.
2. The same equality holds with a `PricingConfigOverride` (custom min fee, custom cap, custom tiers) applied to both.
3. Constant parity: min platform fee 250 and max total fee 2500 produce identical floor/cap behaviour in both.

Risk: none (test-only). Rollback: delete the test. Verification: the test fails if either file is edited one-sidedly — demonstrated by temporarily perturbing a constant in a scratch run and reverting.

## Item 5 — F1 / F2 / F3 ledger hygiene (report first, no writes)

Read-only evidence already gathered:

**F1 — fixtures vs real charges.** Confirmed split:

- `SD-2026-000002` … `SD-2026-000006`: one payment row each with `provider_reference` literally `PSK_REF_SEED_002` … `PSK_REF_SEED_006`, `raw_payload` NULL, all inserted 2026-03-08. Unambiguously **seed fixtures** — not a Paystack reference format, no provider response.
- `SD-2026-000001`: **real**. 13 payment attempts with genuine `SD-SD-2026-000001-<epoch>` references, the last two carrying a real Paystack `raw_payload` (`amount: 87465000` kobo), final status `succeeded`.

So `SD-2026-000001` is a real charge whose stored pricing row is stale, and `…0005`/`…0006` are fixtures. Recommendation for your decision (nothing applied): leave every fixture row untouched, and for `SD-2026-000001` do **not** rewrite the pricing row either — see F2.

**F2 — the ₦9,350 is explained; three fee generations exist.** For `SD-2026-000001` (item ₦850,000):

| Source | Fee | Total |
| --- | --- | --- |
| `transaction_pricing` row | 34,000 (2.5% + 1.5%, uncapped) | 884,000 |
| What Paystack actually charged (payment + ledger `payment_credit`) | 24,650 (2.9% tier, uncapped) | 874,650 |
| Canonical `computePricing` today | 2,500 (capped) | 852,500 |

The ₦9,350 gap is exactly 34,000 − 24,650: the pricing row was written under an older flat-percentage model and never matched the charge. The ledger and the payment agree with each other (874,650 = 850,000 hold + 2,000 + 22,650 fee_record), so the **money is internally consistent**; only the stored preview row is wrong. Proposed treatment, for approval: leave the historical charge alone and record the divergence as a documented legacy-pricing note rather than rewriting a financial row. Rewriting `transaction_pricing` here would make the row disagree with the ₦874,650 the buyer actually paid — recommended against.

**F3 — wider than one row.** Not just `…0005`: **every** `adjustment` entry (9 of 9) has `balance_after` NULL, as do `payout_awaiting_release` (1), `dispute_release_approved_pending_admin_release` (2) and one `freeze_hold`. Cause to confirm before any change: these entry types are written by paths that never compute a running balance. Proposal (approval required): treat `balance_after` as defined **only** for cash-movement entries in the canonical balance chain, backfill it for the 9 adjustments in one recomputation ordered by `created_at` per transaction, and add a guard in `ledger_write_guarded` so future adjustments always carry a balance. Lower-risk alternative: document `balance_after` as nullable for non-chain entry types and drop the invariant. I will recommend one after you see the per-transaction recomputation dry-run.

**Admin code fix — flagged for review.** `supabase/functions/admin-escrow-overview/index.ts:171-172` defines `CREDIT = {payment_credit}` and `DEBIT = {payout_debit, refund_debit}`. Proposed correct treatment:

- `adjustment` — **is** cash movement, signed amount: add to the running balance as `+amount` (negatives already carry their sign). Currently missing → the balance trend understates.
- `fee_record` — `is_cash_movement = false` in the data; it decomposes an existing `payment_credit`, so counting it would double-count. **Keep excluded**, with a comment saying so.
- `freeze_hold` — `is_cash_movement = false`; moves money between states, not in or out. **Keep excluded** from balance; it is already surfaced in the frozen KPI.
- `payout_awaiting_release` / `dispute_release_approved_pending_admin_release` — intent markers, not movements. Keep excluded.

Net: one real change (include `adjustment`), the rest becomes documented intent. **This changes admin escrow trend numbers**, so it needs explicit sign-off plus a re-run of the admin smoke suite and a before/after numeric comparison of the overview endpoint.

**Dead settings keys.** `platform_fee_percentage` = "2.5" and `processing_fee_percentage` = "1.5" exist at platform scope, are referenced by zero TypeScript files, and match exactly the legacy math behind the stale pricing rows. Recommendation: **do not delete** (a settings-row delete is a data write with no benefit). Mark deprecated instead — document them and add them to a deprecated-keys list in the settings screen so nobody wires them up again. Deletion only if you prefer it.

Risk/rollback: nothing is written in the report step. Any later data change would be a single migration with a recorded before-state, reversible by those recorded values.

## Item 6 — C1 completion confirmations (verify only)

Evidence already gathered. Four transactions are `completed` / `funds_released`:

- `SD-2026-000005` — seed fixture (see F1); its whole status history was inserted in one timestamped batch on 2026-03-01. Not a code path.
- `SD-2026-000019` and `SD-2026-000021` — real payments, completed 2026-04-19 with history reason "Buyer confirmed receipt — initiating fund release", but zero `transaction_completion_confirmations` rows and NULL `buyer_confirmed_at`.
- `SD-2026-000024` — real, completed 2026-06-13, **has** 2 confirmation rows and both confirm timestamps populated.

Reading: the confirmation write was added to the verify path between April and June, and `…0019`/`…0021` predate it — legacy data, not an open bypass. Remaining verification step before stating that conclusively: read `supabase/functions/transaction-verify/index.ts` and `seller-confirm-completion/index.ts` end to end and confirm the confirmation insert is unconditional on the current release path, and that no other route can set `completed` without it. If that read shows a genuine bypass, I will propose the minimal server-side guard and stop for approval. No data backfill is proposed either way — writing confirmation rows for a completion with no real actor would fabricate an audit record.

---

## Verification for the whole batch

- Full Vitest run (baseline: 180 passed / 109 skipped) plus the new parity, head-hook, and route-mount tests.
- `tsgo --noEmit` clean.
- Static link/param extraction re-run: zero unresolvable routes after the two new routes are added.
- Admin routes smoke suite re-run (baseline 47/47) — required before and after any Item 5 admin change.