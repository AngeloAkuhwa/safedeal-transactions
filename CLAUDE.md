# SafeDeal working agreement

Standing instructions for every session on this repository. This is the process
the project runs on. Follow it unless the user overrides it in the moment.

## The loop

Branch, PR, self-review against the codebase, merge. Nothing goes to `main`
directly.

The user has granted standing permission to **review and merge** the PRs this
process produces. That permission replaces waiting for a human reviewer. It does
not replace the gates below.

Each PR states three things: what it fixes, what it deliberately did **not**
fix, and what it could not verify. A PR that cannot say the third has not looked
hard enough.

Work iteratively. One coherent change per PR, even when the next one is obvious.
A twenty page mechanical sweep is one PR. A twenty page sweep plus a redesign is
two.

## House style (applies to code, comments, commits, PRs and UI copy)

1. **No em dashes anywhere.** Not in UI strings, not in code comments, not in
   commit messages or PR bodies. Use a comma, a colon, parentheses, or start a
   new sentence. This is a hard rule, checked in review.
2. **No AI generated images, illustrations or icons.** Icons come from the
   `lucide-react` set already in the project. Product imagery is the seller's
   own photography. Never generate, and never ship, synthetic artwork.
3. Write comments that explain **why**, especially the failure that motivated
   the code. Match the density and register of the surrounding file.

## Preflight, run before every PR and report the numbers

| gate | command | bar |
|---|---|---|
| typecheck | `npx tsc -p tsconfig.app.json --noEmit` | clean |
| tests | `npx vitest run` | 0 failed |
| lint | `npx eslint .` | at or below baseline (**1421**). Parity is the gate, not zero |
| edge parse | `npx vitest run src/__tests__/edge-functions-parse.contract.test.ts` | all pass |
| render audit | `node scripts/mobile-audit.mjs` | clean at every width below |

Report each as a number. A gate that found nothing reports zero. A gate that
could not run says so and is **not** counted as a pass. Never let a skip print as
a tick. That failure mode has cost this project real defects more than once.

### Environment notes that will bite

* `bun install --frozen-lockfile` fails in the sandbox. `bun.lock` pins tarball
  URLs on a private Lovable registry that returns 403 here. Fall back to
  `npm install --legacy-peer-deps` for local validation, then **delete
  `package-lock.json` and revert `package.json`** before committing.
* Do not add or change dependencies. `bun.lock` cannot be regenerated here, and
  a `package.json` that disagrees with it breaks CI's `--frozen-lockfile` step.
* Live database tests need `PGHOST`. Locally, use `ALLOW_SKIP_LIVE_DB=1`.
* `@vitest-environment node` is required for any test that loads esbuild. jsdom
  returns a different realm `Uint8Array` from `TextEncoder` and esbuild refuses
  to start against it.

## Rules that have already been paid for

Each of these exists because something shipped past a green suite.

1. **Fix the class, never the line.** Where a primitive exists, the fix goes in
   the primitive. Raising `TabsTrigger` to 44px fixed every tab in the app.
2. **Every miss becomes a guard.** The PR that fixes a defect adds the check
   that would have caught it. No exceptions.
3. **A check that cannot see something must say so.** Prefer a loud failure to a
   silent pass. `methodFor()` throws on an unreadable source rather than
   guessing POST, because guessing made 51 role enforcement tests hollow while
   still counting as passes.
4. **Verify every new guard against the pre-fix source.** Show it failing on the
   broken code, not just passing on the fixed code.
5. **Auth before answers.** An admin function returns only 401, 403 or 405
   before it knows who is calling. Enforced by
   `src/__tests__/auth-precedes-answers.contract.test.ts`.
6. **A clean auto-merge is not a safe auto-merge.** Git reports no conflict when
   two branches insert the same block at different offsets, and keeps both. That
   produced a `SyntaxError` in an edge function that every gate passed. Run the
   edge parse guard after any merge.
7. **One copy, always.** Two seller navigations drifted until the storefront was
   missing two whole sections, all notifications, and the account suspension
   banner. A second copy only has to be forgotten once.

## UI and UX standard

The bar is a system that reads as **designed, not assembled**, and that beats
Shopify and Shopaza on polish. Use the `ui-ux-pro-max` skill and 21st.dev
components for anything visual: layout, type, spacing, motion, component choice.

### Responsiveness is not mobile only

Every screen must be correct at **every** class of viewport, not just phones.
Check all of these, in both themes:

| class | widths to check |
|---|---|
| mobile | 320, 360, 390, 414 |
| tablet | 768, 834, 1024 |
| desktop | 1280, 1440 |
| large | 1920, 2560 |

At each width, verify against the real rendered page, not the source:

* no horizontal page scroll, and no element wider than its container;
* no glyph escaping its own box, which is the check static analysis structurally
  cannot do and the reason the render audit exists;
* type scales sensibly. Nothing smaller than 12px, headings that stay in
  proportion, line length that stays readable rather than running the full width
  of a 2560px display;
* every interactive control is at least 44 by 44px;
* spacing, radius and element widths look deliberate at that width rather than
  stretched or squeezed from another one.

`scripts/mobile-audit.mjs` currently covers the four mobile widths only.
Extending it to the tablet, desktop and large columns is open work. Until it is
done, those widths are verified by hand and the PR must say so.

### Mobile should feel like an application, not a website

On phone widths the product should read as a native app:

* bottom tab bar for primary navigation, thumb reachable, safe area aware;
* sheets and drawers rather than centred desktop style modals;
* full height layouts using `dvh`, never `vh`, because iOS clips `vh`;
* momentum scrolling contained to the right region, with the chrome staying put;
* transitions that feel physical and quick, and that respect
  `prefers-reduced-motion`.

### The glass surface

Chrome layers use translucency plus blur, in the manner the seller header
already establishes: a `bg-card/85` style translucent surface with
`backdrop-blur-lg` and a hairline border. Keep it consistent, keep contrast
legible against whatever scrolls underneath, and always define an opaque
fallback for browsers without `backdrop-filter`.

Motion is smooth and short. Respect the existing motion budget and the reduced
motion guard.

### Non negotiable: keep the existing colour system

The palette in `src/index.css` is the project's, in both light and dark. Work
**within** those tokens. Do not introduce new hex values and do not introduce a
second accent.

* `--primary: 212 85% 38%` is the one accent. Light and dark are already paired.
* `--success` only for a genuinely completed state. `--warning` and
  `--destructive` only for real problems. A neutral state stays neutral.
* Everything routes through the semantic tokens (`bg-background`,
  `text-muted-foreground`, `border-border`). No raw Tailwind colour in
  components, and no `text-white` or `text-black`.
* Colour must never be the only thing carrying meaning, and tinted text must
  still reach 4.5:1. Where a tint cannot, put the colour on the border, the wash
  and the icon, and run the words at full contrast.

### The change bar

Only change a screen if the result is **materially better** than what is there.
Consistency, hierarchy, legibility and removing noise all count. A lateral
restyle does not. When in doubt, leave it.

Never break a working screen to improve it.

### Standing design debt (Phase 4 and 5 direction)

* One accent. Remove the amber next action gradient, the four zero value
  coloured tiles, and the red navigation button.
* Icon diet. Roughly 50 to 60 icons on the heaviest screens. Remove the
  `w-10 h-10 rounded-lg bg-primary/10` tile pattern, icon prefixed headings, and
  repeated per row icons. This is the biggest contributor to the assembled feel.
* Radius off the shadcn default, and borderless cards. Whitespace first, then a
  background shift, then soft elevation.
* One system, not two. The landing page defines fluid utilities the app never
  uses.
* A display typeface for headings only, with a system stack for body.
* One product card with six elements: image, price, title, one trust element,
  one social proof element, location. Container queries, not viewport units.

## Priority order

From the master plan, and not a cage. Anything needed for correctness or polish
can be done as it is found, provided it clears the change bar.

1. **Guest pay** (P3.2). The largest remaining lever. `/t/:shareToken/pay` is a
   public route whose page is not: an anonymous buyer is bounced to `/auth` and
   `/role-selection` before ever seeing what they are paying for. The frontend
   is ours. Identity attachment and RLS are Lovable's half.
2. **Back affordance** (P2.4). No shared component exists and pages hand roll
   their own. Seller navigation (P2.3) is done.
3. **Phase 4, the design system.** Start with the icon diet and the colour law.
   They produce the visible change and they are measurable: icon count per
   screen, accent colours in use.
4. **Phase 5, imagery and the seller dashboard.** Depends on Phase 4's card
   anatomy being settled.

Tracked debt: 65 raw `<img>` sites across 51 files; roughly 190 shrink only
currency entries; Supabase default privileges that re-grant anonymous DML on
future tables after every migration; and roughly 380 standalone `"—"` empty-value
placeholders in admin tables, which are a pending product decision rather than
prose (see `src/__tests__/no-em-dashes.contract.test.ts`).

## Out of scope without asking

* Backend, RLS and identity work scoped to Lovable.
* Anything needing a service role key.
* Dependency or lockfile changes, per the environment notes.
* Rewriting history on a branch that is not ours.
