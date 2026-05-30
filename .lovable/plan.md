## Scope

`src/pages/AdminDisputeDetail.tsx` only — the Financial Overview & Controls `<section>` (lines ~540–613) and the `FinMetric` helper (lines ~1070–1103). No other section is touched. Subtitle and top divider were already removed in the previous patch and stay removed.

## Problem

On the 875px tablet viewport (and likely beyond), the card produces a horizontal scrollbar and the metric values feel oversized vs the reference. Causes:

- `gap-x-12` on Row 1 (4 columns) and `gap-x-16` on Row 2 (3 columns) — too wide for 875px content area, forces overflow.
- Funds Status value uses `xl:whitespace-nowrap` — "Held in Escrow" + 12px dot + gaps pushes the 4-col row past the card width at borderline widths.
- Metric values at `xl:text-[28px]` are bigger than the reference (~22–24px).
- `break-words` on default values can produce awkward wrap on `$5,200.00` at narrow widths.

## Changes

1. **Row gaps** (`<section>` body, both grids):
   - Row 1 grid: `grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-6 md:gap-x-8 gap-y-7`.
   - Row 2 grid: `grid grid-cols-1 md:grid-cols-3 gap-x-8 md:gap-x-10 gap-y-7`.
   - Divider stays as the only inner horizontal line: `my-7 md:my-8 h-px bg-[#253044]`.

2. **Funds Status / Payout Status value nodes** — drop `xl:whitespace-nowrap`, shrink dot to `h-2.5 w-2.5`, shrink value text to match #3 below, and remove the extra `mt-2` offset on the Payout Status dot so it aligns with the text baseline:
   - Funds Status value span: `text-[20px] md:text-[22px] xl:text-[24px] leading-[28px] font-semibold tracking-[-0.02em]`, color `#FACC15`.
   - Payout Status wrapper: `flex items-center gap-2` (was `items-start`), dot has no `mt-2`, same value typography in `#F87171`.

3. **`FinMetric` default value** (line 1090): reduce to `mt-2 text-[20px] md:text-[22px] xl:text-[24px] leading-[28px] font-semibold tracking-[-0.02em] tabular-nums` and drop `break-words` so currency strings stay on one line.

4. **`FinMetric` label** (line 1085): keep `text-[13px] md:text-[14px] leading-[18px] text-[#9CA3AF]`.

5. **`FinMetric` caption** (line 1097): keep `mt-2 text-[12px] md:text-[13px] leading-[18px] text-[#9CA3AF]`; remove `break-words`.

6. **Overflow guard** on the section: add `min-w-0` to the section and to both grids so the flex parents never push the card width. Keep `overflow-hidden` on the section so any stray child can't introduce horizontal scroll.

7. **Heading block** stays as-is (no top border, no subtitle). The blue highlight in the user's screenshot is browser text selection, not a style — no code change needed for it.

## Out of scope

- No data, no copy, no color tokens changed beyond the typography sizes above.
- Alert strips (`mx-5 md:mx-8 mb-5 md:mb-8 …`) untouched.
- No changes to any other card or section.

## Acceptance

- At 875px viewport: card shows heading, 4-up row, single divider, 3-up row, no horizontal scrollbar, no value wraps to 3 lines, "Held in Escrow" and "Blocked" sit on one line.
- At ≥1280px: matches the attached reference proportionally (heading top-left, comfortable padding, one inner divider).
- Subtitle and top divider remain gone.
