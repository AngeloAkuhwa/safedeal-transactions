## Goal

Correction pass on `/admin/disputes/:id`. The page currently uses normal document scrolling, so the "sticky" header scrolls away and the right Resolution sidebar moves with the content. Fix the scroll containment so the dispute header stays pinned, the left workspace scrolls under it, and the right Resolution sidebar scrolls independently — without touching the central admin sidebar.

## Files touched

- `src/components/admin/AdminLayout.tsx` — add an opt-in `fullHeight` mode that constrains the outer shell to `h-screen overflow-hidden` and renders `<main>` as `h-screen min-h-0 overflow-hidden` instead of the default scrolling main. Existing pages keep current behavior (default `fullHeight = false`).
- `src/pages/AdminDisputeDetail.tsx` — rewrite the page's outer layout to use the new mode and the correct scroll containers. No business logic, no service changes, no new components.

No other files change. No DB, no edge functions, no service edits.

## Layout (Admin Dispute Detail only)

```text
AdminLayout (fullBleed + fullHeight)         ← outer shell: h-screen overflow-hidden
└── <main> h-screen min-h-0 overflow-hidden
    └── div flex h-full min-h-0
        ├── section  flex-1 min-w-0 h-full overflow-y-auto     ← LEFT workspace scroll
        │   ├── header  sticky top-0 z-30 bg-card border-b border-border
        │   │           (back, title, subtitle, SLA badge, Print)
        │   ├── section bg-card border-b border-border         ← summary strip (NOT sticky)
        │   │           grid grid-cols-2 md:grid-cols-4 gap-6 p-6/8
        │   └── div p-6 lg:p-8 space-y-8                       ← all dispute cards
        │       Buyer+Seller (grid lg:grid-cols-2 gap-6)
        │       Financial Overview & Controls
        │       Locked Agreement (read-only, when present)
        │       Buyer Claim + evidence
        │       Seller Response / awaiting state
        │       Case Communication (tabs)
        │       Case Timeline
        │       Internal Notes & Investigation
        │       Linked Records & Quick Actions
        └── aside hidden xl:block w-[380px] shrink-0 h-full overflow-y-auto
                  bg-card border-l border-border               ← RIGHT sidebar scroll
            Resolution Status
            Resolution Actions (Case Control + Resolution Actions groups)
```

Key rules:
- The page does **not** wrap content in a normal scrolling div. Scrolling lives only on the left `section` and the right `aside`.
- The sticky dispute header sits inside the left scroll container so the summary strip and all cards pass under it.
- Right `aside` is a flex sibling (not `position: sticky`) and gets its own `overflow-y-auto`, so it never moves with left content.
- Mobile (`< xl`): `aside` is hidden; existing mobile action bar / inline Resolution panel renders inside the left scroll area at the bottom of the cards (reuse what's already there). Page still scrolls inside the left container only.

## AdminLayout change

Add `fullHeight?: boolean` prop. When true:
- Outer wrapper: `h-screen overflow-hidden` (instead of `min-h-screen`).
- Main column wrapper: `h-screen min-h-0 overflow-hidden`.
- `<main>` (when `fullBleed`): `flex-1 min-h-0 overflow-hidden bg-background` and renders children directly (no inner wrappers).
- Desktop sidebar stays exactly as-is (`hidden lg:block`, `sticky top-0 h-screen`). Mobile drawer, headers, reading-mode controls untouched.
- Default (`fullHeight = false`) keeps the current implementation byte-for-byte so other admin pages are unaffected.

## Dispute page changes

- Call `<AdminLayout title="Dispute" hideDefaultHeaders fullBleed fullHeight>`.
- Replace current `grid xl:grid-cols-[...]` wrapper with the `flex h-full min-h-0` layout above.
- Move the header JSX (currently `sticky top-0 z-30 ...`) inside the left scroll `section`; keep its `sticky top-0 z-30 bg-card/95 backdrop-blur border-b border-border` classes.
- Move the summary strip out of the cards stack into its own non-sticky `bg-card border-b border-border` band immediately under the header.
- Wrap the remaining cards in a single `div className="p-6 lg:p-8 space-y-8"`. Keep all current child components, dialogs, gating, services, and queries unchanged.
- Right sidebar: remove the current `sticky top-0 h-screen overflow-y-auto` wrapper and render as the `aside` sibling described above. Same children (`Resolution Status`, `Resolution Actions`), same handlers, same `adminActionsAvailable` gating.

## Out of scope

- No changes to services, action wiring, dialogs, evidence preview, locked-agreement read-only rules, money-state logic, or any backend.
- No restyling of cards beyond removing the extra outer padding wrapper (so they sit cleanly inside the new scroll container).
- No changes to other admin pages or the central admin sidebar.

## Acceptance

1. Central admin sidebar unchanged.
2. Document/body does not scroll on `/admin/disputes/:id`.
3. Scrolling the dispute workspace keeps the dispute header pinned; summary strip and cards pass under it.
4. Right Resolution sidebar stays visible and scrolls independently at `xl+`.
5. At `< xl` the right sidebar collapses (hidden) and the page still scrolls only inside the left workspace.
6. All existing action buttons, dialogs, and data bindings continue to work; no fake state transitions introduced.
