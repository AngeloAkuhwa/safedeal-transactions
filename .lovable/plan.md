
# Exact Fixes: Transaction Detail Page — 100% Match

## What I See in Image 2 (Current) vs Image 3 (Reference)

### NextActionCard Differences (lines 141–209)

**Fix 1 — Icon: rounded-xl → rounded-full, h-10 w-10 → h-12 w-12**
- Line 144: `h-10 w-10 rounded-xl bg-white/20` → `h-12 w-12 rounded-full bg-white/20`

**Fix 2 — Title layout: icon + title must be on ONE flex row, no inner `<div>` wrapper**
- Lines 143–149: `flex items-start gap-3` → `flex items-center gap-3`, remove the extra `<div>` wrapper around `<h2>`

**Fix 3 — Gradient: add solid end stop**
- Line 142: `from-warning to-warning/80` → `from-warning to-warning/90`

**Fix 4 — Countdown label: `text-xs opacity-80` → `text-sm font-semibold`**
- Line 158: change `text-xs opacity-80 mb-1` → `text-sm font-semibold mb-2`

**Fix 5 — Countdown number: `text-4xl` → `text-3xl`**
- Line 159: change `text-4xl font-bold tabular-nums` → `text-3xl font-bold tabular-nums`

**Fix 6 — "Verify Item Received" button: `h-11` → `py-4 h-auto`**
- Line 168: change `h-11` → `py-4 h-auto`

**Fix 7 — "Raise Dispute" button: remove `border border-white/20`**
- Line 174: remove `border border-white/20` from className

**Fix 8 — Other Actions section spacing: `mt-5 pt-4` → `mt-6 pt-6`**
- Line 192: change `mt-5 pt-4` → `mt-6 pt-6`

**Fix 9 — Other Actions buttons: add `font-semibold text-left backdrop-blur-sm`**
- Lines 195–203: each `<button>` className add `font-semibold text-left backdrop-blur-sm` and change `px-3` → `px-4`

### TransactionTimeline Differences (lines 774–857)

**Fix 10 — Circle size: add `sm:h-12 sm:w-12` responsive sizing**
- Line 816: `h-10 w-10` → `h-10 w-10 sm:h-12 sm:w-12`

**Fix 11 — Completed circle: `bg-success/20` → `bg-success/10`**
- Line 818: `bg-success/20` → `bg-success/10`

**Fix 12 — Completed content card: add `border border-success/20`**
- Lines 836–838: completed case `bg-success/5` → `bg-success/5 border border-success/20`

**Fix 13 — Completed text: title `text-success`, subtitle `text-success/80`**
- Line 840: for `isReached` case, change title from `text-foreground` → `text-success`
- Line 844: for `isReached` subtitle, change `text-muted-foreground` → `text-success/80`

## Implementation

Single file: `src/pages/BuyerTransactionDetail.tsx`

All changes are targeted line-level edits to:
- `NextActionCard` function (lines 141–209) — Fixes 1–9
- `TransactionTimeline` return JSX (lines 774–857) — Fixes 10–13

No new dependencies needed. No structural changes to routing or data fetching.
