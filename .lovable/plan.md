## Scope
Right sidebar of the Admin Dispute Detail page only. Single file: `src/pages/AdminDisputeDetail.tsx`. No services, no other pages, no business logic.

## Problem
- `Block Payout` and `Resume Payout` sit flush under `Close Without Resolution`, with the same tight `space-y-1.5` gap as every other row. The two colored solid buttons feel cramped and visually indistinct from the items above them.
- Solid colored buttons (Refund Buyer, Release Funds, Block Payout, Resume Payout) use the same `py-2.5` padding and 16px icon as the flat outline rows, so they look thin and "AI-generated" rather than weighted action buttons.
- `Resume Payout` currently uses the generic `Play` icon (media-player feel) — design calls for a more deliberate filled-circle play.

## Changes (all inside `src/pages/AdminDisputeDetail.tsx`)

### 1. Group Block / Resume Payout as a distinct payout-control pair
Inside the `Resolution Actions` `SidebarGroup`, wrap the two payout buttons in their own block with a hairline separator and extra top spacing:

```text
<div class="mt-3 pt-3 border-t border-[#253044]/70 space-y-2">
  <SidebarBtn ...Block Payout solid red />
  <SidebarBtn ...Resume Payout solid emerald />
</div>
```

This visually separates payout controls from refund/release/close actions and gives the colored solids breathing room.

### 2. Weightier solid buttons in `SidebarBtn`
In the `SidebarBtn` component:
- When `variant === "solid"`: use `py-3` (instead of `py-2.5`), `gap-2.5`, and an 18px icon (`[&_svg]:h-[18px] [&_svg]:w-[18px]`) with `strokeWidth={2.25}` applied via a wrapper className.
- Outline rows stay exactly as they are (`py-2.5`, 16px icons) so the flat list remains compact.
- Solid icon span drops the `iconColor` muted token and inherits `text-white` from the solid button.

### 3. Icon polish
- Swap `Play` → `PlayCircle` for `Resume Payout` (filled-circle play, matches design intent; less media-player feel).
- Keep `Ban` for `Block Payout` (universal stop/forbid, already correct).
- Refund Buyer (`RotateCcw`), Release Funds (`Wallet`) stay — they match design.

### 4. Slightly more air on the Resolution Actions group
Change the `SidebarGroup`'s inner `space-y-1.5` → `space-y-2` **only** for the Resolution Actions group (by passing an optional `gapClass` prop to `SidebarGroup`, defaulting to current `space-y-1.5`). Outline-heavy groups (Case Control, Investigation) keep the tight spacing; the colored-action group breathes.

## Out of scope
Header, left sidebar, mobile Sheet, summary strip, main cards, tabs, dialogs, services, business logic, and all other `SidebarBtn` rows.
