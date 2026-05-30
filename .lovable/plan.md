# Fix tablet-mode layout for Admin Dispute Detail

Scope: `src/pages/AdminDisputeDetail.tsx` only. No service, schema, or routing changes. `AdminLayout` sidebar untouched. Case Communication / Timeline sections untouched. This pass is responsive-tuning + the specific structural fixes called out for tablet (768–1199px).

## Global

- Breakpoint contract (Tailwind defaults):
  - mobile `< md` (`< 768px`)
  - tablet `md` → `< xl` (`768–1279px`)
  - desktop `xl` (`≥ 1280px`)
  - The user's spec says tablet ends at 1199 and desktop at 1200 — Tailwind's `xl` is 1280. Close enough; using `xl` for the desktop-only side-by-side keeps tablet (875px) safely stacked.
- Page main wrapper: `mx-auto w-full max-w-screen-xl px-4 md:px-6 overflow-x-hidden`.
- Page outer grid (main + right resolution sidebar): `grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6`. On `<xl` the right Resolution sidebar drops below the main content as a normal full-width section (no stickiness on tablet/mobile).
- Add `min-w-0` to every grid/flex child that wraps text, so nothing pushes width.
- Section gap: `space-y-6 md:space-y-6`.

## 1. Page header

- Container `flex flex-wrap items-center gap-3 px-2 md:px-0 py-4`.
- Left cluster: back arrow (ghost icon button) + title block (title `text-[22px] font-semibold leading-7`, subtitle `text-sm text-muted-foreground truncate`). Title block uses `min-w-0 flex-1`.
- Right cluster: overdue pill + Print ghost button, `ml-auto flex items-center gap-2 shrink-0`. On narrow tablets where this would force wrap, allowed to wrap to its own row underneath via the `flex-wrap`.
- No extra vertical padding beyond `py-4`.

## 2. Summary strip

- `grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-x-6 gap-y-5` inside a `Card` with `p-5 md:p-6`.
- 8 cells: Dispute ID · Transaction (blue link) · Amount in Dispute · Dispute Reason (orange) · Created · Last Activity · Status (chip aligned left, not floating right) · Assigned Agent (avatar 24px + name on one line `truncate`).
- Each cell: label `text-xs text-muted-foreground mb-1`, value `text-sm font-semibold text-foreground truncate` (drop the current uppercase `[11px]` label style for this strip).
- `min-w-0` on every cell to prevent overflow.

## 3. Buyer / Seller Information cards

- Wrapper: `grid grid-cols-1 xl:grid-cols-2 gap-6` (stacks on tablet — fixes squeeze).
- `PartyCard` no longer uses `CardHeader` (kills the divider under the title). Body is a single `p-5 md:p-6` block.
- Inner layout:
  1. Title row: `flex items-center justify-between mb-5` — title `text-[18px] font-semibold` + role chip (blue/orange `rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wider`). No divider.
  2. Identity row: `flex items-center gap-3 mb-5` — 48px Avatar · name (`text-[17px] font-semibold truncate`) + user id (`text-sm text-muted-foreground truncate`) · right-aligned trust badge (`Verified` emerald `CheckCircle2` for buyer, `Gold Seller` yellow `Star` for seller), `shrink-0`.
  3. Details grid: `grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 mb-5`. Each field: label `text-sm text-muted-foreground mb-1`, value `text-[15px] font-medium text-foreground truncate` (`min-w-0` parent). Buyer: Email · Phone · Prior Disputes · Account Status. Seller: Email · Phone · Prior Disputes · Payout Status. Status values keep their semantic colours (Active green, Blocked red, etc.).
  4. Primary action row: `grid grid-cols-[1fr_1fr_48px] gap-2` — Call (`h-10 rounded-lg`, blue for buyer / orange for seller), Email (`h-10 rounded-lg`, dark slate outline), profile square (`h-10 w-10 p-0 rounded-lg` outline). No overlap, equal heights.
  5. Single divider: `border-t border-border mt-5 pt-5`.
  6. Secondary action row: `grid grid-cols-3 gap-2` on `≥sm`, `grid-cols-1` on `<sm`. Buttons `h-10 rounded-lg`, `gap-2` between icon (`h-3.5 w-3.5`) and label (`text-xs sm:text-sm`). On the 875px tablet viewport all three fit comfortably because the card is now full width.

## 4. Financial Overview & Controls

- Plain title row (no `CardHeader` divider): title `text-[18px] font-semibold` + helper `text-sm text-muted-foreground` directly under, inside `p-5 md:p-6`.
- Divider between header and content: `border-t border-border`.
- Top metrics: `grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 p-5 md:p-6`. Cells:
  - Total Transaction · Amount in Dispute (orange) · Protection Fee · Funds Status.
  - Value: `text-[22px] md:text-[24px] font-semibold leading-8 break-words`.
  - Helper: `text-xs text-muted-foreground mt-1`.
  - Funds Status uses a chip with leading dot + label, allowed to wrap to a second line if needed (`flex-wrap`), never clip.
- Mid divider: `border-t border-border mx-5 md:mx-6`.
- Bottom row: `grid grid-cols-1 md:grid-cols-3 gap-6 p-5 md:p-6`.
  - Eligible Refund (green) · Eligible Release (blue) `After fees` · Payout Status (red `Blocked (dispute active)`) `Pending resolution`.
  - Same value sizing. `Blocked (dispute active)` chip uses `break-words` + `max-w-full` so it wraps inside its column instead of overflowing horizontally (current bug).
- All cells get `min-w-0`. No horizontal scroll.

## 5. Locked Agreement

- Header: `flex flex-wrap items-start justify-between gap-3 p-5 md:p-6` — left title + helper subtitle, right `View full agreement` outline button (`h-9 rounded-lg`). On narrow tablet the button wraps below cleanly because of `flex-wrap`.
- Divider: `border-t border-border`.
- Data grid: `grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-10 gap-y-6 p-5 md:p-6`.
- Fields: Item · Condition · Agreed Price · Delivery Method · Verification Window · Locked At · Total.
- Label `text-xs uppercase tracking-wider text-muted-foreground mb-1`, value `text-[15px] text-foreground`. Item value `truncate` with `title` attribute (no more "Samsung Galaxy S24 Ul…" mid-word break unless container is truly too small).

## 6. Buyer Claim

- Header inside `p-5 md:p-6`: title `Buyer Claim` + reason subtitle (`Damaged Item Received`). Divider allowed underneath (matches reference).
- Body `p-5 md:p-6 space-y-5`:
  - Description text `text-[15px] text-foreground leading-relaxed`.
  - Evidence section: `EvidenceGrid` (shared component, see §8).

## 7. Seller Response

- Header inside `p-5 md:p-6`: title `Seller Response` + count subtitle. Divider underneath.
- Body `p-5 md:p-6 space-y-5`:
  - Response panel: `rounded-xl border border-border bg-muted/30 p-4 md:p-5`.
    - Inner: `flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3`.
    - Left: `Response #N` muted label, then response text `text-[15px] text-foreground leading-relaxed`.
    - Right: date/time `text-xs text-muted-foreground shrink-0`.
  - Evidence: same `EvidenceGrid`. Single-tile case still aligns to the start of the grid (no stretching). The current "filename overflowing at the top of a huge empty box" comes from the tile having no fixed thumbnail area — fixed in §8.
- Empty state (no response yet): inset panel showing `MessageSquare` icon + `No response yet` + `Seller has until <date> to respond` — never a blank card.

## 8. Shared EvidenceGrid (used by Buyer Claim + Seller Response)

- Grid: `grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5`. Tiles never stretch full card width — single tile aligns left within its column.
- Tile (fixed shape, identical heights):
  - Wrapper: `flex flex-col overflow-hidden rounded-xl border border-border bg-muted/20`.
  - Thumbnail area: `aspect-[4/3] flex items-center justify-center bg-muted/40 overflow-hidden`.
    - Image kind: `<img class="h-full w-full object-cover">` with `onError` swap to `ImageIcon`.
    - Document kind: centered `FileText` `h-10 w-10 text-muted-foreground`.
    - Video kind: centered `Video` `h-10 w-10 text-muted-foreground`.
  - Footer: `p-3 border-t border-border`.
    - Filename `text-sm font-medium text-foreground truncate` (single-line ellipsis, `title` attribute).
    - Meta `text-xs text-muted-foreground truncate`: `<Role> · <relative time>`.
- This kills the current "filename inside the preview area" bug: filename is in the footer, the preview area is a fixed aspect-ratio box that always shows the correct icon/image.

## 9. Right Resolution sidebar

- On `<xl`, sidebar moves below the main content as a normal full-width card stack (no sticky positioning, no fixed 360px column). On `xl+` it returns to a sticky 360px right column. Implemented by collapsing the outer page grid to one column on `<xl` (§Global).

## 10. Mobile (`<md`) specifics

- All grids collapse to a single column (already covered above).
- Card padding `p-5`.
- Section gap `space-y-5`.
- Party-card primary action row stays `grid-cols-[1fr_1fr_48px]` (still fits at 375px); secondary action row collapses to `grid-cols-1` only when text would overflow — default `grid-cols-3` until width forces the wrap via `text-xs`.
- Evidence grid 1 column on `<sm`, 2 on `sm`, 3 on `xl`.
- Financial top row 1 column, bottom row 1 column.

## 11. Overflow guards (applied throughout)

- Page main: `overflow-x-hidden`.
- Every grid/flex child holding text gets `min-w-0`.
- Every long value gets `truncate` (single line) or `break-words` (large currency, status chips) as appropriate.
- Buttons: `whitespace-nowrap` on labels; icons fixed `h-3.5 w-3.5` or `h-4 w-4` so they never grow.

## Out of scope

- AdminLayout chrome / sidebar nav.
- Case Communication, Timeline, Audit Logs sections.
- Any data, service, RLS, or route changes.

## Verification

- 1440px desktop: Buyer/Seller side-by-side, summary 8-col, financial 4-top / 3-bottom, agreement 4-col, evidence 3-up. Right Resolution sidebar sticky on the right.
- 1024–1279px tablet: Buyer/Seller stacked full width, summary 4-col, financial 2-top / 3-bottom, agreement 2-col, evidence 3-up, Resolution sidebar now sits below main content. No clipping, no horizontal scroll, no button overlap.
- 875px (current viewport): same as 1024 but agreement may drop to 2-col, evidence drops to 2-up. Primary action buttons remain `Call | Email | profile`. `Blocked (dispute active)` wraps within its cell.
- 375px mobile: every section single column, evidence 1-up, all text wraps without clipping, no horizontal scroll.
- Diff confined to `src/pages/AdminDisputeDetail.tsx`.
