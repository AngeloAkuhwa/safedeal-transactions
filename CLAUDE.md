# SafeDeal — working agreement

Standing instructions for every session on this repository. This is the process
the project runs on; follow it unless the user overrides it in the moment.

## The loop

Branch → PR → self-review against the codebase → merge. Nothing goes to `main`
directly.

The user has granted standing permission to **review and merge** PRs that this
process produces. That permission is not a shortcut past the gates below — it
replaces waiting for a human reviewer, not the verification.

Each PR states three things: what it fixes, what it deliberately did **not**
fix, and what it could not verify. A PR that cannot say the third has not
looked hard enough.

Work iteratively. One coherent change per PR, even when the next one is
obvious. A 20-page mechanical sweep is one PR; a 20-page sweep plus a redesign
is two.

## Preflight — run before every PR, report the numbers

| gate | command | bar |
|---|---|---|
| typecheck | `npx tsc -p tsconfig.app.json --noEmit` | clean |
| tests | `npx vitest run` | 0 failed |
| lint | `npx eslint .` | ≤ baseline (**1421**) — parity is the gate, not zero |
| edge parse | `npx vitest run src/__tests__/edge-functions-parse.contract.test.ts` | 177 pass |
| render audit | `node scripts/mobile-audit.mjs` | 320 / 360 / 390 / 414px clean |

Report each as a number. A gate that found nothing reports zero; a gate that
could not run says so and is **not** counted as a pass. Never let a skip print
as a tick — that failure mode has cost this project real defects twice.

### Environment notes that will bite

- `bun install --frozen-lockfile` fails in the sandbox: `bun.lock` pins tarball
  URLs on a private Lovable registry that 403s. Fall back to
  `npm install --legacy-peer-deps` for local validation, then **delete
  `package-lock.json` and revert `package.json`** before committing.
- Do not add or change dependencies. `bun.lock` cannot be regenerated here, and
  a `package.json` that disagrees with it breaks CI's `--frozen-lockfile`.
- Live-DB tests need `PGHOST`; locally use `ALLOW_SKIP_LIVE_DB=1`.

## Rules that have already been paid for

Each of these exists because something shipped past a green suite.

1. **Fix the class, never the line.** Where a primitive exists, the fix goes in
   the primitive. Raising `TabsTrigger` to 44px fixed every tab in the app.
2. **Every miss becomes a guard.** When a defect gets past the gates, the PR
   that fixes it adds the check that would have caught it. No exceptions.
3. **A check that cannot see something must say so.** Prefer a loud failure to
   a silent pass. `methodFor()` throws on an unreadable source rather than
   guessing POST, because guessing made 51 role-enforcement tests hollow while
   still counting as passes.
4. **Verify a guard against the pre-fix source.** A new test must be shown
   failing on the broken code, not just passing on the fixed code.
5. **Auth before answers.** An admin function returns only 401/403/405 before
   it knows who is calling. Enforced by
   `src/__tests__/auth-precedes-answers.contract.test.ts`.
6. **Watch clean auto-merges.** Git reports no conflict when two branches
   insert the same block at different offsets, and keeps both. This produced a
   `SyntaxError` in an edge function that every gate passed. After any merge,
   run the edge parse guard.

## UI/UX standard

The bar is a system that reads as **designed, not assembled**. Use the
`ui-ux-pro-max` skill and 21st.dev components for anything visual — layout,
type, spacing, motion, component choice.

### Non-negotiable: keep the existing colour system

The palette in `src/index.css` is the project's, in both light and dark. Work
**within** these tokens; do not introduce new hex values or a new accent.

- `--primary: 212 85% 38%` is the one accent. Light and dark are already paired.
- `--success` only for genuinely completed states. `--warning` / `--destructive`
  only for real problems. A neutral state is neutral — not amber.
- Everything routes through the semantic tokens (`bg-background`,
  `text-muted-foreground`, `border-border`). No raw colour in components.

### The change bar

Only change a screen if the result is **materially better** than what is there.
Consistency, hierarchy, and removing noise count as materially better. A lateral
restyle does not. When in doubt, leave it.

Never break a working screen to improve it. Run the render audit at 320 / 360 /
390 / 414px on anything visual, and confirm both themes.

### Standing design debt (Phase 4/5 direction)

- One accent. Kill the amber "next action" gradient, the four zero-value
  coloured tiles, the red navigation button.
- Icon diet — roughly 50–60 icons on the heaviest screens. Remove the
  `w-10 h-10 rounded-lg bg-primary/10` tile pattern, icon-prefixed headings and
  repeated per-row icons. This is the biggest contributor to the "AI dump" feel.
- Radius off the shadcn default; borderless cards. Whitespace, then a background
  shift, then soft elevation.
- One system, not two — the landing page defines fluid utilities the app never
  uses.
- Display typeface for headings only, system stack for body.
- One product card, six elements: image, price, title, one trust element, one
  social-proof element, location. Container queries, not viewport units.

## Priority order

From the master plan, and not a cage — anything needed for correctness or
polish can be done as it is found, provided it clears the change bar above.

1. **Guest pay** (P3.2) — the largest remaining lever. `/t/:shareToken/pay` is
   a public route whose page is not: an anonymous buyer is bounced to `/auth`
   and `/role-selection` before ever seeing what they are paying for. Frontend
   is ours; identity-attachment and RLS are Lovable's half.
2. **Seller navigation + back affordance** (P2.3, P2.4) — two navigation models
   today (`SellerNav` on 16 pages, `SellerStorefrontSidebar` on 4) and 31 pages
   hand-rolling their own back link. ~20 pages, one PR, mechanical but wide.
3. **Phase 4 — the design system.** Start with the icon diet and the colour law:
   they produce the visible change and they are measurable (icon count per
   screen, accent colours in use).
4. **Phase 5 — imagery and the seller dashboard.** Depends on Phase 4's card
   anatomy being settled.

Tracked debt: 65 raw `<img>` sites across 51 files; ~190 shrink-only currency
entries; Supabase default privileges that re-grant anon DML on future tables
after every migration.

## Out of scope without asking

- Backend/RLS/identity work scoped to Lovable.
- Anything needing a service-role key.
- Dependency or lockfile changes (see above).
- Rewriting history on a branch that is not ours.
