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

Merge authority, restated by the user 2026-08-24: standing permission to
merge any PR that is green and does not break what already exists. The
gates above are what "does not break" means in practice. UI previews are
still published for every customer-visible change so the user can always
see what shipped; they are a deliverable, no longer a merge gate. Edge
function changes remain per-change: only ones that provably do not alter
behaviour on healthy data proceed without asking.

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
| 2.1b | Social proof and location on the card. The plan's six-element anatomy wants a social proof element and a location; the backend served neither, and facts are not invented here. Taken over at the user's direction (phase 7.3). The `marketplace` and `public-storefront` functions now serve `sold_count` per product (completed transactions that originated from it, completed only) and the seller's `city_name`/`state_name`; the card renders them as one quiet meta line that disappears entirely when neither fact exists, because "0 sold" is the absence of social proof shouted. Ratings stay absent on purpose: no rating infrastructure exists (no reviews table, no capture point) and a hollow star row is invented trust; building it is decision D9. Do-not-break: the card's container-query price sizing, the delegation from both old card names, the marketplace payload shape (fields added, none changed). | completes the card anatomy | `product-card-data.contract` (renders the real card; asserts presence and absence; red-verified: 5 of 8 fail on the pre-fix card) | done (sold counts + location); ratings = D9 |
| 2.2 | **Radius and borderless cards.** Measuring reframed the item: `--radius` was already off the default (0.75rem), but only sm/md/lg derived from it, so `rounded-lg` and `rounded-xl` rendered identically across 800+ sites and the radius had no knob. Every step now derives from the token (xl 12 to 14px, 2xl unchanged). Cards are borderless in light (transparent 1px border keeps layouts; elevation via `--shadow-card`) and hairlined in dark, where a shadow cannot separate a surface from a near-black ground. No 460-site sweep was needed: the mapping was the class fix. | only worth doing against the settled card anatomy from 2.1 | `radius-and-elevation.contract` | done (#52) |
| 2.3 | **Display typeface for headings** (decision D3: Archivo, chosen from rendered specimens), system stack for body. Self-hosted variable woff2 like Inter; one `--font-display` token carried by every heading utility (`h-display`, `h-section`, `h-card`, `sd-page-title`, and the new `h-page`/`h-hero`). Absorbed the fixed `text-3xl` page heroes deferred from 2.4: 30 customer headings moved to the fluid steps, so the face and the scale landed together. Numbers (money, countdowns, scores) deliberately keep Inter for its tabular figures. Admin headings wait for 4.5. | independent of 2.1/2.2 | `type-system.contract` | done (#56) |
| 2.4 | **One fluid system.** Measuring reframed it: the app shell already had its own utilities (`sd-page`, 85 usages), stepped at breakpoints while the landing's flowed with clamps, plus three pages hand-rolling a third container. `sd-page` now carries container-x's exact clamp (a contract fails if the two ever diverge), `sd-page-y` and `sd-page-title` are fluid, and the strays are folded in. Page-title scale unification across the 49 fixed `text-3xl` heroes deliberately waits for 2.3, where the display face and the scale land together. | closes "one system, not two" | `one-fluid-system.contract` | done (#53) |

| 2.5 | **Product voice.** The landing and pricing copy tells vendors how SafeDeal makes money ("Free forever, paid to grow", "we only earn when you get paid") where reference platforms (Shopify, Payaza) lead with the merchant's outcome and state fees plainly in the fee table, once. Added at the user's direction as content strategist: reframe customer-facing marketing copy value-first across landing, pricing and any surface with the same posture, grounded in a study of comparable platforms. Fees stay fully disclosed; what changes is what leads. Second beat (#55): the landing hero and closing CTA sell the seller's ambition, per the widened reference study. Third beat (#57), at the user's direction as product lead: every "free" claim is scoped to what actually costs nothing (open, list, share) and sits beside "you pay only when a deal completes", because unscoped "free forever" next to a per-deal fee reads as bait on a trust product. The fee number itself stays loud: it is market-cheap and success-conditioned, and hiding it would cost more vendors than stating it. | copy is design material; the voice is part of the system | `product-voice.contract` (revenue-first phrasing blocklist on customer surfaces; unscoped-free blocklist; fee disclosure and the scoping line asserted present so posture never becomes opacity) | done (#54, #55, #57) |

### Phase 3: mobile app feel close-out (task #8)

| # | item | guard | status |
|---|---|---|---|
| 3.1 | Migrate the remaining 16 customer `DialogContent` to `ResponsiveDialog`, in 2–3 batches by surface (checkout modals, then seller tools, then profile/security) | `responsive-dialog-width`, render test | blocked: user decision D1 |
| 3.2 | Motion pass: entrance/exit transitions consistent, `prefers-reduced-motion` audit across new sheets | reduced-motion contract | blocked: 3.1 |

### Phase 4: product features (pending and missing)

| # | item | owner | status |
|---|---|---|---|
| 4.1 | **Guest pay backend half**: identity attachment on pay, RLS for anonymous reads. Frontend has been ready since #33; until this lands, an anonymous buyer can read the payment page but not pay. The single largest unfinished user-facing feature. Taken over at the user's direction (2026-08-24, phase 7). Recon found anonymous reads already served (`resolve-share-token` runs service-role and never reads the caller), so the missing half was exactly one thing: nothing ever made the account a guest just created into the transaction's `buyer_id`, so the frontend's sign-up round trip ended at a 403. Fix: `initiate-paystack-payment` claims an unclaimed transaction (buyer_id null) for the first signed-in link holder, with a conditional UPDATE (`where buyer_id is null`) so a race has one winner; sits after the status and money gates so a cancelled or paid transaction can never acquire a buyer; fills the buyer participant seat (guarded by `user_id is null`) and writes a `buyer_claimed_by_link` transaction event. A transaction bound to another account still refuses. Do-not-break: the strict 403 for bound transactions, the state gates ahead of the claim, offer claiming (`claim-offer` binds by email match, untouched). | here (was Lovable) | done, guarded by `guest-claim.contract` (red-verified: 5 of 5 fail on pre-fix source) |
| 4.2 | **amount_mismatch operator surface**: #46 refuses mismatched charges and stores the payload; nothing yet shows an operator that it happened. Needs a product decision on where (admin reconciliation screen already exists). | here, after decision D4 | blocked: D4 |
| 4.3 | Admin roadmap stubs (impersonation, per-user export, add-user): currently honest "coming soon" toasts. Build or remove per product priority. | decision D5 | blocked: D5 |
| 4.4 | Currency formatting debt burn-down. Measuring reframed the item: the primitive already exists (`formatMoney` dashes missing amounts, currency is a required parameter) and the ratchets already guard it; the work is burning down the six shrink-only lists in `invented-defaults.contract` (186 entries at start). Batch 1 (#58): the 13 customer frontend files in `MONEY_ZERO_DEBT`, where `?? 0` on money could render an invented ₦0.00 to a buyer or seller; counts renamed count-shaped, gates made NaN-safe, one file's `\|\| "NGN"` fixed in passing (its `CURRENCY_DEBT` entry went stale and was removed; 186 to 172). Batch 2 (#59): the 11 admin frontend files in the same list; both admin detail pages' local `ngn` wrappers had re-imposed `?? 0` over the dashing formatter, and the escrow tile now shows only recorded figures (sums and fallback chains skip absent parts instead of inventing 0). Batch 3 (#60): instrument precision; the zero pattern matched `?? 0.02` (the documented 2% fee-rate default) because digit-to-dot is a word boundary, and the policy file left the list once the false positive was fixed. Edge tail reclassified after reading the sites: most edge `?? 0` normalize SQL NULL aggregates where null honestly means zero activity (reconciliation sums, dashboard rollups), and the risky sites already fail closed (fee-chain mismatch flags for review, unknown seller level yields a 0 limit, missing snapshot yields a 0 refund ceiling). Low value to churn; they stay recorded. Two real product questions extracted to decisions D7 and D8. Symbol and positional lists stay recorded with their existing rationale (harmless while the book is NGN-only). | here | batches 1 to 3 done (#58, #59, #60); edge tail recorded by design |
| 4.5 | Admin surface colour conversion. Measuring shaped the approach: 4,065 raw utilities across 159 admin files are one dark vocabulary spoken inline (slate ground; wash/text/border triads per meaning; a categorical hue set for roles), with 30 patterns covering 59% and a 301-pattern accidental tail. The arc: (a) `components/admin/palette.ts` is the one definition site (tones by meaning, categories kept apart), exempt from the call-site budget with a rot check, landed with badges.tsx as first consumer, pixel-identical by construction since the class strings moved verbatim (#61, budget 4278 to 4236); (b) convert the big screens one surface at a time in later batches (DisputeDetail 377, UserDetail 271, TransactionDetail 215, PayoutsTable 174 are the leaders), exact-string swaps mechanical and pixel-identical, any deliberate shade convergence shipped separately with a preview; (c) only after the vocabulary holds, decide whether admin becomes theme-aware. Do-not-break rule for every batch: identical class strings or it is not a mechanical batch. | here | in progress (batches 1 to 12: #61 to #72; count 4278 to 3411) |

### Phase 6: end-to-end close-out (adopted 2026-08-24 at the user's direction)

The remaining distance to "done end to end" on this repo's side, in execution
order. Merges are currently queued behind a Supabase auth outage (CI's
credential preflight has returned 504s since 06:38 UTC); work continues on
stacked branches and merges land bottom-up when auth recovers.

| # | item | status |
|---|---|---|
| 6.1 | Finish the 4.5 mechanical batches: AdminUserDetail (#70), then AdminDisputeDetail (377 raws, in two slices), AdminTransactions (157), AdminDisputes (116), AdminSettings (97), then the mid tail (FlaggedUserDrawer 87, AdminAuditLogs 83, UserDetailDrawer 81, FlaggedUserCard 71, EscrowAlertsPanel 55, CompareRolesMatrix 36, remainder). Identical class sets only, one batch per PR, budget probed and ratcheted every time. | in progress |
| 6.2 | Deliberate visual convergence: fold the stray shades the mechanical rule had to leave into their tones, in small per-tone PRs, each with a preview. Batch 1 (#75): all 127 yellow utilities across 21 admin files folded into amber, retiring yellow as an admin hue; the colour-law contract now bans it outright (red-verified), and the specimen preview shows each composite before and after on the real ground. Batch 4 is the orange mirror of batch 2 and mechanical: the elevated badge and chip triads, panel pair, chip hover and guarded shorts, across 17 files, pixel-identical. It also surfaced the palette's one real asymmetry, recorded rather than silently resolved: `warning.text` is amber-300 while every other tone's standalone text (elevated, danger, info, success, special) is at the 400 step, so batch 3 conformed 38 amber sites to the palette's single anomalous entry. Contrast does not decide it (measured against both grounds, every tone clears 4.5:1 at both steps, amber 12.4 and 10.7 on slate-900), so it is a coherence call and goes to the user as D10. Batch 5 is the orange fold, unblocked by D10 resolving in favour of the palette as written: seven standalone orange-300 texts conform DOWN to `elevated.text` (orange-400), the opposite direction from batch 3's amber fold, because in both cases the call sites conform to the palette rather than the palette to them. Three sites are held back deliberately: AdminCaseTimeline and AdminDisputeDetail tint timeline headers emerald-300 / orange-300 / red-300 as a family, and AdminTransactionDetail pairs a red-300 failure reason with an orange-300 blocked reason; folding one hue out of a multi-hue 300 family breaks the set. Batch 6 takes the three 300 families and finds a rule 7 defect underneath: `TIMELINE_TONE` was defined twice, character for character, in `AdminCaseTimeline` and `AdminDisputeDetail`, each with its own copy of the four-hue header tint. `ADMIN_TIMELINE` in the palette now owns both, the tint converges from 300 to each tone's `.text`, and `AdminTransactionDetail`'s red-300 / orange-300 payout pair conforms with it. Batch 7 takes the solid CTAs mechanically and completes `ADMIN_SOLID` with the `elevated` entry orange never had. Remaining, and both now evidence-backed rather than guessed at: (a) the `/20` washes. Measured across the admin surface there are SIX wash intensities in use (`/5` 34, `/10` 321, `/15` 191, `/20` 108, `/25` 13, `/30` 2), so `/20` is a real third tier at 108 sites, not drift to be swept away, and some of its uses (`bg-red-500/20 border-red-500/40` on risk tiers) look deliberately hotter than a normal badge. Reading where the `/20` lands then settled the rule. The flagged-user risk tiers all use ONE recipe, a `/20` wash with a `/40` border, one step heavier than the badge on both, applied identically across critical, high and medium. That is the system making a distinction, not three people guessing, and folding it into the badge would erase it. So batch 8's rule is **not** "fold `/20` away": the heavy pill earns its own palette entry (`badgeStrong`, `/20` + `/40`), and only the genuinely stray borderless `/20` washes that follow no recipe fold into the chip. Previewed on the specimen with both weights side by side on the real ground. Batch 8 ran that rule: `ADMIN_BADGE_STRONG` records the heavy pill (Partial, like `ADMIN_SOLID`, because only three tones carry one), `risk.ts` consumes it, and `medium` converges from amber-200 to its tone's 300, the batch's one deliberate pixel move. `low` stays raw: a solid slate chip is not a wash pill. The rule 7 defect was narrower than first recorded and worth correcting here: `FlaggedUsersTable` already consumes `RISK_PILL` properly; only `FlaggedUserCard` inlined the four-branch ternary, beside an import of the very module that exports it. Now fixed, pixel-identical. **Still open, and deliberately not done**: the borderless `/20` washes have no palette home at all, because every entry carries a border, so "fold them into the chip" would add one. Whether they get an entry or a border is a shape decision, not a wash one. (b) The hover one-offs. Batch 9 measured that and found it three times larger than the orange note suggested: 86 resting/hover pairs across the admin surface, disagreeing 27 to 32 about which direction a hover moves. Close enough to even that reading never caught it, though the symptom shipped, two buttons side by side on AdminDisputes with one deepening and one brightening under the same pointer. Two conventions were already present and each internally perfect, so the batch conformed to them rather than inventing a third: the neutral slate ground LIFTS a step (29 sites, no exceptions, which is what every dark theme does), saturated solids DARKEN (what `ADMIN_SOLID` has encoded since batch 7). The 27 strays flipped, and where the flip made the class set exact the site now consumes `ADMIN_SOLID`. `hover-direction.contract` holds both halves of the rule, red-verified on all 27, and its pairing is nearest-preceding-same-hue rather than anything-on-the-line, which is the whole guard: a naive first version reported both a false violation and a false clean on `AdminNotifications`, whose toggle writes two complete correct pairs inside one ternary. Held back and still raw, each with a reason: two sky buttons (sky is a real admin hue at 85 sites with no palette tone at all, and inventing one is not a hover fix), three solids setting `text-foreground` where the palette says `text-white`, and two whose triad is split across a long utility string, where reordering is eyeballing rather than a rule. **Findings this batch opened rather than closed**: sky has no tone, and the solid CTA text colour disagrees with itself. | in progress (batches 1 to 9: #75 to #77, #80, #83, #84, #85, plus this PR; admin count 3411 to 3010) |
| 6.3 | **Admin icon diet**, and admin headings onto `--font-display`. Measured before scoping, and the measurement split the item in two. The admin surface carries 919 icon usages, but only **5** matches of the tile pattern the customer diet banned and **28** icons inside headings, so extending the two existing guards costs 33 sites, not hundreds. Those 33 are 6.3a. Separately, the heaviest screens (AdminDisputeDetail 77 icons, AdminTransactionDetail 74) sit well above the plan's 50 to 60 target, but thinning them is judgement per screen rather than a guard rule, so that is 6.3b. The type half is a third piece: `h-card` is already used in admin (8 of its 9 uses repo-wide), while `h-page` and `h-section` are customer-only and 16 admin headings set their own `text-*xl` step. Do-not-break: the icon stays where it carries the meaning (empty states keep their glyph, losing only the decorative tile wash), `h-card` adoption already in place, and the tile guard's existing customer scope. | `icon-diet-tiles`, `icon-diet-headings` and `type-system.contract` all extended to the admin surface they deliberately skip today | 6.3a done (#87: 28 headings cleared, both icon guards widened, 38 orphaned imports removed of which 21 predated it). Type half done here: the exemption in `type-system.contract` is closed and the five admin page titles join the display scale. **A gap the measurement found and this batch did not paper over**: `h-page` spans 1.5 to 1.875rem and `h-card` tops out at 1.125rem, but admin's section headings sit at `text-xl` (1.25rem), so there is no display tier between them. Converting those to `h-page` would grow them 20 to 50% on a surface whose whole job is density, so they keep Inter until that tier exists; adding one is a scale decision, not a conversion. Note the guard closure cleared no backlog: admin already had zero h1-h3 at a fixed 3xl or larger, so it shuts a door rather than fixing a mess, and it is red-verified with a planted probe in the directory it used to skip. 6.3b (density on the heaviest screens) still queued. |
| 6.4 | Raw `<img>` migration: the guard measured today's truth at 52 sites across 40 files (the 65/51 figure predated the renditions work). Product imagery moves onto `ProductImage`; QR codes, receipts, evidence and avatars keep plain `<img>` deliberately. `raw-img.contract` holds the inventory shrink-only in both directions (#73); conversion batches classify and shrink it. Batch 1 classified every site and found the item much smaller than its count: only four of the 52 were ever product photos a rendition could serve (the product hero on SellerProductPreview, whose own thumbnails already used the primitive; the SellerAnalytics top-products thumbnail; the AdminTransactionDetail item photo; and PurchaseAuthModal, converted back in #41). The other 48 are avatars, uploaded dispute evidence, local pre-submit previews, deliberate full-size lightboxes, a QR code and two static brand assets, and each surviving entry now records which. The batch also fixed a real defect in the guard: its stripper only removed `{/* */}` JSX comments, so PurchaseAuthModal's own migration note (which contains the word `<img`) kept a finished conversion on the debt list. | done: 52 sites classified, 4 converted, 48 deliberate and annotated |
| 6.6 | **One avatar, always.** Surfaced by 6.4's classification. The admin surface held six implementations of one decision: a real `UserAvatar` in `components/admin/flagged-users/` (used by its three siblings, and by nobody else because a primitive in a feature subfolder does not get found), local `Avatar`/`SellerAvatar` copies in `EscrowRecordsTable`, `AdminDisputes`, `AdminTransactionDetail` and `PayoutDetailDrawer`, and nine inline ternaries. The drift was already shipped: three initials rules disagreed about the empty-name case, rendering `?`, `??` or nothing, some fallbacks showed one letter and others two, and `alt` alternated between the person's name and empty on avatars printed beside that same name. Fix: `components/common/UserAvatar.tsx` owns only the decision (photo or initials, which initials, what `alt`); every call site keeps its own size, shape and ring, and the flagged-users box stays where it is and delegates. Do-not-break: `ui/avatar` (Radix), which the 18 customer-side files compose and which is a different primitive for a different job; the rounded-xl profile avatars; the presence-dot and badge siblings; and the icon-fallback sites, which are deliberately not initials. | done (14 sites, 5 local copies retired) |
| 6.5 | Whether admin becomes theme-aware: goes to the user as a decision once 6.1 to 6.3 hold, per the 4.5 arc. | queued decision |

Blocked externally and excluded from this path: decisions D1 to D8 (each
unblocks its own item, nothing here waits on them). The three items that
were parked as Lovable's half (guest pay backend 4.1, product card data
2.1b, Supabase default privileges) were taken over at the user's direction
on 2026-08-24; see phase 7. After phases 6 and 7, what remains in this repo
is decision-shaped, not work-shaped.

### Phase 7: backend takeover (adopted 2026-08-24 at the user's direction)

The user explicitly widened scope past "Backend, RLS and identity work
scoped to Lovable": "pls complete your side and take over these too". Each
item still lands plan-first, one PR each, with its guard and its
do-not-break list. The service-role path for live changes is Lovable's
`query_database`; schema changes are ALSO committed as migration files so
the repo stays the source of truth.

| # | item | status |
|---|---|---|
| 7.1 | Guest pay backend (the 4.1 row above): claim-on-pay in `initiate-paystack-payment`. | done (this PR) |
| 7.2 | Supabase default privileges re-grant anonymous DML on future tables. Measured live 2026-08-25: everything reachable from the `postgres` role is ALREADY clean and already guarded. Existing public tables carry zero anon DML grants, all have RLS enabled, the postgres-grantor default ACLs are empty for client roles (a probe table created live arrived with no anon privileges), and `live-db.contract` pins every one of these facts, including the 24 `supabase_admin` default-ACL rows recorded verbatim as a known platform-owned exception. The residue is exactly those rows, and they are provably unreachable from here: `SET ROLE supabase_admin` and `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` both return permission denied (probed live), which is also why migration 20260815011243's guarded attempt bailed out. A migration from this side would be a no-op wearing a fix's clothes, so none was written; the fix was handed to the party that owns the role (see 7.4). When Lovable applies it, the exact-match baseline in `live-db.contract` fails loudly by design and gets shrunk to the revoked shape. | done on our side; platform half raised via 7.4 |
| 7.3 | Product card data (2.1b): the card's trust, social proof and location slots want real data. Sold counts are derivable from completed transactions; location from the seller profile; ratings need product infrastructure that does not exist yet, so they became decision D9 rather than silent scope. See the 2.1b row for the full shape. | done (see 2.1b); ratings = D9 |
| 7.4 | Raise auth-layer stability with Lovable: the 2026-08-24 GoTrue degradation (11.5 hours of flapping 504s on `/auth/v1/token` while Postgres stayed healthy) blocked merges, likely failed real sign-ins, and made admin edge functions 500. CI now rides flaps (three retry layers, #74) but the service itself is Lovable's to fix. Raised 2026-08-25 via a plan-mode message (so their agent could not edit this project's code off the back of it), covering both the incident fact pattern and the 7.2 default-ACL request. Their agent independently re-verified the ACL rows, flagged that `graphql` and `graphql_public` carry the same anon defaults, confirmed the backend reports healthy now, confirmed neither side of the project can run the ALTER, and drafted a platform-team escalation plan (`.lovable/plan.md`). **Next step is the user's**: approve that plan in the Lovable editor so it is escalated, and relay the platform's answer on whether default grants get periodically re-applied. | raised; escalation awaiting user approval in Lovable |
| 7.5 | Loose ends: merged remote branches need a GitHub-UI cleanup (the environment's git proxy blocks delete pushes); the 42px tap-target row on the seller storefront at 360px stays a watch item, treated as real if it recurs in CI. | tracked |

### Decisions queue (user input needed; nothing blocks silently)

| id | decision | blocking |
|---|---|---|
| D1 | Does the bottom sheet feel right on a real phone? (preview has captures) | 3.1, 3.2 |
| D2 | ~325 standalone placeholder dashes in admin tables: keep, or replace with words? | admin polish |
| D3 | Which display typeface for headings? Answered: Archivo, chosen from rendered specimens | none (2.3 done) |
| D4 | Where should an `amount_mismatch` event surface for operators? | 4.2 |
| D5 | Admin roadmap stubs: build impersonation / per-user export / add-user, or remove the buttons? | 4.3 |
| D6 | Rating stars moved from amber to the accent in #34: keep or revert? | none |
| D7 | create-transaction and buyer-disputes resolve an unknown seller/buyer level to a 0 limit (silent fail-closed). Replace with an explicit "unknown level" refusal so the seller sees why, or keep the silent limit? | edge batch |
| D8 | Admin CSV exports print 0 for absent escrow figures. An empty cell would be honest but changes the artifact a downstream consumer may parse. Empty or 0? | edge batch |
| D10 | Standalone tinted text: one step, which one? **Resolved 2026-08-25 without escalating, on the plan's own principle: the palette is the one definition site and call sites conform to it.** The tempting reading, that warning's amber-300 encodes "caution is the softest signal", does not survive contact with the palette: info and success carry no severity at all and also sit at 400, so nothing predicts warning's 300. But conforming warning would move **74** consumers, against **7** for the strays, and it would reverse a decision one batch old. So the palette is unchanged and the strays conform. Flipping it later stays a one-line change precisely because the sets are now consumed, which is the point of having consumed them. Measured for the record: every tone clears 4.5:1 at both steps on both grounds, so legibility never forced the question. | resolved; orange fold shipped |
| D9 | Product ratings. The card anatomy's trust element is currently the identity-verified claim; real ratings need a reviews capture point (post-completion prompt), a table with RLS, an aggregation the card can read, and moderation posture. Worth building only if reviews are wanted as a product feature; the card is honest without them. Build, or leave the verified claim as the trust element? | nothing (card is complete without it) |

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
