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
| 2.1 | **One product card.** Three cards (`MarketplaceProductCard` 256 lines, storefront `ProductCard` 133, `SellerProductCard` 187) disagree on what a product is; a buyer sees different trust info per surface. One card, six elements (image, price, title, one trust element, one social proof element, location), container queries not viewport units. | rule 7; explicitly gates Phase 5 in the original plan | new `product-card-single-copy.contract`; render audit | pending |
| 2.2 | **Radius and borderless cards.** Off the shadcn default; whitespace first, then background shift, then soft elevation. ~460 `rounded-lg/md` sites outside `ui/`. | only worth doing against the settled card anatomy from 2.1 | ratchet on raw radius utilities in customer components | blocked: 2.1 |
| 2.3 | **Display typeface for headings**, system stack for body. `Inter` is currently the only family. | independent of 2.1/2.2 but needs the user's taste on the face | render audit both themes; type scale check | blocked: user decision D3 |
| 2.4 | **One fluid system.** The landing utilities (`h-section`, `section-y`, `container-x`, `body-lead`) reach the app shell, not just 10 landing files and 5 app pages. | closes "one system, not two" | usage count assertion | blocked: 2.2 |

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
| D3 | Which display typeface for headings? (options will be presented with renders) | 2.3 |
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
