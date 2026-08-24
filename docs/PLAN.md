# SafeDeal master plan

The single source of truth for what is done, what is next, and in what order.
Every session reads this before touching code. Every PR that completes an item
updates this file in the same PR. If work is happening that this file does not
describe, the work is wrong or this file is, and either way that gets fixed
first.

Last full-system audit: 2026-08-23 (routes, links, flows, security, colour,
navigation, money path). Findings all resolved or scheduled below.

## The operating loop (standing flow)

Adopted 2026-08-23 at the user's direction, after a run of fixes that felt
circular. The diagnosis of the circles, so we do not repeat them:

1. **Guards were narrower than the defect class.** The colour law walked
   `.tsx` and missed a whole accent system in a `.ts` file. A line-based grep
   "found" ten missing `rel` attributes that a multi-line parser showed never
   existed. The fix class was right; the instrument was too small. Rule: a
   guard covers the class, and its blind spots are written down in the guard
   itself.
2. **State lived in sessions, not in the repo.** What was done, deliberately
   not done, or awaiting a decision was re-derived each session and sometimes
   re-litigated. Rule: this file is that state. Sessions update it, never
   re-derive it.
3. **The same screens churned under many small PRs**, which reads as circling
   even when nothing regressed. Rule: the sequence below batches by surface
   and dependency, so a screen settles once.

The loop for every piece of work, no exceptions:

1. **Plan first.** The item exists in this file with its dependencies, its
   guard, and its do-not-break list before any code changes.
2. **Fix the class, never the line**, in the primitive where one exists.
3. **Guard verified red** against the pre-fix source, then green.
4. **Preflight** (typecheck, tests, lint vs baseline, edge parse, render
   audit) with numbers reported. A gate that cannot run says so and is not a
   pass.
5. **One coherent change per PR**; edge parse re-run after every merge
   (clean auto-merges have lied before).
6. **Show the work**: visual changes ship with a preview capture.
7. **Close the loop here**: the PR that finishes an item moves it to Done in
   this file, with its PR number.

New UI consumes the existing primitives, never re-implements them:
`tone.ts` (colour meaning), `buyer-navigation/links.ts` and
`seller/navigation/links.ts` (destinations), `BackLink` (back affordance),
`ResponsiveDialog` (modals), `ProductImage` (product photos),
`safe-redirect.ts` (redirect targets), `product-visibility.ts` (visibility
vocabulary). A second copy of any of these is a defect by definition.

## Done and guarded (do not reopen)

Each line names the guard that keeps it true. If a guard goes red, the fix is
in current work, not in re-doing these.

| area | landed | guard |
|---|---|---|
| CI truth: role probes hit real methods; auth before answers | #22 | `auth-precedes-answers`, `admin-auth` (live, 102 tests) |
| Edge functions parse | #22 | `edge-functions-parse` (177) |
| Seller navigation, one copy | #24 | `seller-navigation.contract` |
| Em dashes out of prose | #26, #30 | `no-em-dashes.contract` |
| Back affordance, one copy | #27 | `back-affordance.contract` |
| Colour law ratchet (now `.ts`-aware) | #28–#34, #45 | `colour-law.contract` |
| Visibility vocabulary, one copy | #32 | `one-visibility-vocabulary.contract` |
| Guest pay frontend (P3.2) | #33 | `guest-pay.contract` |
| Icon diet: headings, tiles (customer now 0) | #35, #36, #48 | `icon-diet-*` |
| Glass fallback, dvh, scroll containment | #37, #40 | `mobile-viewport-units`, `scroll-containment` |
| Live-probe timeout at the root | #39 | (in `admin-auth` setup) |
| Product photos through renditions | #41 | (icon-tile guard fixed same PR) |
| ResponsiveDialog + first three sheets + safe-area | #38, #42 | `responsive-dialog.render`, `responsive-dialog-width` |
| Route link graph: no dead links | #43 | `route-link-graph.contract` |
| One redirect validator | #44 | `safe-redirect.contract` |
| Money path: amount assertion, superseded refusal, payout trim | #46 | `money-path.contract` |
| Buyer navigation, one list, three presentations | #47 | `buyer-navigation-single-copy.contract` |
| NotFound is a real page; returnPath keeps search | #48 | (route guard covers the links) |

## The sequence

Work top to bottom. An item starts only when everything it depends on is
Done. Status values: `pending`, `in progress`, `blocked: <on what>`, `done
(#PR)`.

### Phase 0: land the audit train

| # | item | status |
|---|---|---|
| 0.1 | Merge #47 (buyer nav), #48 (hygiene), #45 (colour law `.ts`) when green; edge parse after each | done (#45, #47, #48) |
| 0.2 | Rebuild main, full eleven-width audit, republish the preview artifact with the audit before/afters | done (44 rows clean) |

### Phase 1: audit tail (small, independent, no user input needed)

| # | item | why | guard | status |
|---|---|---|---|---|
| 1.1 | Seller tab list in `MobileTabBar` derives from `seller/navigation/links.ts` (same fix as buyer side in #47); extend the seller contract to see the tab bar | the last duplicated destination list in the app | extend `seller-navigation.contract` | done (#50) |
| 1.2 | Sweep the residual raw colours the widened lens can still see shrinking (admin ratchet only goes down opportunistically; no dedicated PR) | ratchet hygiene | `colour-law.contract` | standing |

### Phase 2: the design system arc (strict order; each gates the next)

| # | item | why this order | guard | status |
|---|---|---|---|---|
| 2.1 | **One buyer product card.** The two buyer-facing cards (marketplace, storefront) disagreed on trust info for the same product; both now delegate to `product/BuyerProductCard`, and the price is sized by the card via container queries (`cqw`), not the viewport. Guarded by the rewritten `price-legibility.contract` (delegation + cqw + no-vw). `SellerProductCard` deliberately stays a separate management tool (edit menu, status, visibility): different audience, different job. | rule 7; gates Phase 5 | `price-legibility.contract` | done (#51) |
| 2.1b | Social proof and location on the card. The plan's six-element anatomy wants a social proof element and a location; the backend serves neither per product (no ratings, no sold counts, no product geography), and facts are not invented here. Needs backend fields first. | completes the card anatomy | extend the card + contract when data lands | blocked: Lovable (product data) |
| 2.2 | **Radius and borderless cards.** Measuring reframed the item: `--radius` was already off the default (0.75rem), but only sm/md/lg derived from it, so `rounded-lg` and `rounded-xl` rendered identically across 800+ sites and the radius had no knob. Every step now derives from the token (xl 12 to 14px, 2xl unchanged). Cards are borderless in light (transparent 1px border keeps layouts; elevation via `--shadow-card`) and hairlined in dark, where a shadow cannot separate a surface from a near-black ground. No 460-site sweep was needed: the mapping was the class fix. | only worth doing against the settled card anatomy from 2.1 | `radius-and-elevation.contract` | done (#52) |
| 2.3 | **Display typeface for headings** (decision D3: Archivo, chosen from rendered specimens), system stack for body. Self-hosted variable woff2 like Inter; one `--font-display` token carried by every heading utility (`h-display`, `h-section`, `h-card`, `sd-page-title`, and the new `h-page`/`h-hero`). Absorbed the fixed `text-3xl` page heroes deferred from 2.4: 30 customer headings moved to the fluid steps, so the face and the scale landed together. Numbers (money, countdowns, scores) deliberately keep Inter for its tabular figures. Admin headings wait for 4.5. | independent of 2.1/2.2 | `type-system.contract` | done (#56) |
| 2.4 | **One fluid system.** Measuring reframed it: the app shell already had its own utilities (`sd-page`, 85 usages), stepped at breakpoints while the landing's flowed with clamps, plus three pages hand-rolling a third container. `sd-page` now carries container-x's exact clamp (a contract fails if the two ever diverge), `sd-page-y` and `sd-page-title` are fluid, and the strays are folded in. Page-title scale unification across the 49 fixed `text-3xl` heroes deliberately waits for 2.3, where the display face and the scale land together. | closes "one system, not two" | `one-fluid-system.contract` | done (#53) |

| 2.5 | **Product voice.** The landing and pricing copy tells vendors how SafeDeal makes money ("Free forever, paid to grow", "we only earn when you get paid") where reference platforms (Shopify, Payaza) lead with the merchant's outcome and state fees plainly in the fee table, once. Added at the user's direction as content strategist: reframe customer-facing marketing copy value-first across landing, pricing and any surface with the same posture, grounded in a study of comparable platforms. Fees stay fully disclosed; what changes is what leads. Second beat (#55): the landing hero and closing CTA sell the seller's ambition, per the widened reference study. | copy is design material; the voice is part of the system | `product-voice.contract` (revenue-first phrasing blocklist on customer surfaces; fee disclosure asserted present so posture never becomes opacity) | done (#54, #55) |

### Phase 3: mobile app feel close-out (task #8)

| # | item | guard | status |
|---|---|---|---|
| 3.1 | Migrate the remaining 16 customer `DialogContent` to `ResponsiveDialog`, in 2–3 batches by surface (checkout modals, then seller tools, then profile/security) | `responsive-dialog-width`, render test | blocked: user decision D1 |
| 3.2 | Motion pass: entrance/exit transitions consistent, `prefers-reduced-motion` audit across new sheets | reduced-motion contract | blocked: 3.1 |

### Phase 4: product features (pending and missing)

| # | item | owner | status |
|---|---|---|---|
| 4.1 | **Guest pay backend half**: identity attachment on pay, RLS for anonymous reads. Frontend has been ready since #33; until this lands, an anonymous buyer can read the payment page but not pay. The single largest unfinished user-facing feature. | Lovable (out of scope here without direction) | blocked: Lovable |
| 4.2 | **amount_mismatch operator surface**: #46 refuses mismatched charges and stores the payload; nothing yet shows an operator that it happened. Needs a product decision on where (admin reconciliation screen already exists). | here, after decision D4 | blocked: D4 |
| 4.3 | Admin roadmap stubs (impersonation, per-user export, add-user): currently honest "coming soon" toasts. Build or remove per product priority. | decision D5 | blocked: D5 |
| 4.4 | Currency formatting: ~292 `formatMoney` call sites, ~190 shrink-only entries tracked. Define the money-display primitive and ratchet. | here | pending (after Phase 2) |
| 4.5 | Admin surface colour conversion (4,278 raw utilities, ratcheted). Last, per the user's stated priority order. | here | pending (last) |

### Decisions queue (user input needed; nothing blocks silently)

| id | decision | blocking |
|---|---|---|
| D1 | Does the bottom sheet feel right on a real phone? (preview has captures) | 3.1, 3.2 |
| D2 | ~325 standalone placeholder dashes in admin tables: keep, or replace with words? | admin polish |
| D3 | Which display typeface for headings? Answered: Archivo, chosen from rendered specimens | none (2.3 done) |
| D4 | Where should an `amount_mismatch` event surface for operators? | 4.2 |
| D5 | Admin roadmap stubs: build impersonation / per-user export / add-user, or remove the buttons? | 4.3 |
| D6 | Rating stars moved from amber to the accent in #34: keep or revert? | none |

### Out of scope without explicit direction

Backend, RLS and identity work scoped to Lovable; anything needing a service
role key; dependency or lockfile changes; rewriting history on branches that
are not ours. Edge function changes are in scope only with the user's
explicit go-ahead per change (given for #46).

## Verified healthy (audit 2026-08-23, for the record)

81 routes, 89 link targets, all connected; auth guard chain sound; cron
functions fail closed; share tokens crypto-random with enforced expiry; no
hardcoded secrets; admin role enforcement live-tested; `_blank` anchors all
carry `rel`; typecheck clean; 1,126+ tests, 0 failed; lint at or below the
1,421 baseline; edge parse 177/177; render audit clean at all eleven widths.
