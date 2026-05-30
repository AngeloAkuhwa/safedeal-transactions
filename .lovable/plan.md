## Scope

Two narrow fixes, no other sections touched:

1. `src/pages/AdminDisputeDetail.tsx` — value typography inside the Financial Overview & Controls card (the `FinMetric` helper and the two custom `valueNode` blocks for Funds Status / Payout Status).
2. `src/components/admin/AdminLayout.tsx` + `src/pages/AdminDisputeDetail.tsx` — the `fullHeight` shell and the dispute page's flex container, so the right "Resolution" sidebar only becomes a fixed side panel at `xl`. Below `xl` the page scrolls normally and the sidebar sits **after** the content.

## Problem 1 — Values too large vs labels

Today:
- Label: `text-[13px] md:text-[14px]`
- Value: `text-[20px] md:text-[22px] xl:text-[24px]`

The value is roughly 1.6–1.7× the label — looks oversized in the card. User wants the value only slightly larger than the label.

### Fix

Update `FinMetric` default value and the two `valueNode` spans (Funds Status, Payout Status) to:
`text-[15px] md:text-[16px] xl:text-[17px] leading-[22px] md:leading-[24px] font-semibold tracking-[-0.01em] tabular-nums`

Keep:
- Label: `text-[13px] md:text-[14px] leading-[18px] text-[#9CA3AF]`
- Caption: `mt-1.5 text-[12px] md:text-[12px] leading-[16px] text-[#9CA3AF]` (slightly tighter caption gap to match the smaller value)
- Dots in Funds/Payout status: shrink to `h-2 w-2` so they align visually with the smaller value text.
- Value `mt-2` becomes `mt-1.5` for a calmer rhythm.

Colors and content unchanged (yellow for Held in Escrow, red for Blocked, etc.).

## Problem 2 — Sidebar takes over tablet/mobile

Today `AdminLayout` with `fullHeight` locks the entire shell to `h-screen overflow-hidden` at every breakpoint, and `AdminDisputeDetail` wraps content + sidebar in `flex flex-col xl:flex-row h-full min-h-0`. On tablet/mobile that means:

- Outer shell is `h-screen overflow-hidden`.
- Main column is also fixed-height and `overflow-hidden`.
- Inside, content `section` is `flex-1 overflow-y-auto` while `aside` is `shrink-0`, so the aside renders at its natural full height and the content section collapses to whatever vertical space is left — visually the user sees the sidebar instead of the dispute body.

### Fix in `AdminLayout.tsx`

Make `fullHeight` apply only at `xl` so the dispute page still gets a desktop "two fixed columns" experience but mobile/tablet scroll normally:

- Outer wrapper: `min-h-screen bg-background text-foreground xl:h-screen xl:overflow-hidden` (was unconditional `h-screen overflow-hidden`).
- Inner flex: `flex min-h-screen xl:h-screen xl:overflow-hidden`.
- Main column: `flex min-w-0 flex-1 flex-col xl:h-screen xl:min-h-0 xl:overflow-hidden`.
- `<main>`: `flex-1 min-w-0 bg-background xl:min-h-0 xl:overflow-hidden`.

The non-`fullHeight` branch stays exactly as it is today. No other admin page changes behavior.

### Fix in `AdminDisputeDetail.tsx`

Update the two-column container around line 471 from:

```
<div className="flex flex-col xl:flex-row h-full min-h-0">
  <section className="flex-1 min-w-0 min-h-0 overflow-y-auto overflow-x-hidden">…</section>
  <aside className="w-full xl:w-[380px] shrink-0 border-t border-border xl:border-t-0 xl:border-l min-h-0 overflow-y-auto bg-card">…</aside>
</div>
```

to:

```
<div className="flex flex-col xl:flex-row xl:h-full xl:min-h-0">
  <section className="flex-1 min-w-0 xl:min-h-0 xl:overflow-y-auto xl:overflow-x-hidden">…</section>
  <aside className="w-full xl:w-[380px] xl:shrink-0 border-t border-border xl:border-t-0 xl:border-l xl:min-h-0 xl:overflow-y-auto bg-card">…</aside>
</div>
```

Effect:
- `<xl`: container has natural height, content stacks above sidebar, the whole page scrolls — user sees the dispute body first, then sidebar below it. The existing mobile "Take Action · Review Case" button at the bottom of the section keeps working.
- `≥xl`: identical behavior to today (fixed-height two columns, each with its own scroll).

## Out of scope

- No content/copy changes.
- No other cards, tabs, or sections.
- No color, header, divider, or padding changes beyond the typography tweaks above.

## Acceptance

- Financial Overview values render at `~15–17px` (only slightly larger than the `13–14px` labels) at all breakpoints.
- On 875px viewport (current tablet): the dispute detail body is visible at the top with tabs scrollable, and the Resolution sidebar appears below it via normal page scroll — not as a takeover panel.
- On ≥1280px (xl): two fixed columns with independent scroll, unchanged from today.
- No horizontal scroll on the Financial Overview card at any breakpoint.
