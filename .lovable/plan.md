
# Precise Fixes to Match Reference Design 100%

## Detailed Diff: Image 3 (Reference) vs Image 2 (Current Output)

### Fix 1 — NextActionCard: Icon is ROUND, not square
- **Reference (HTML line 410)**: `w-12 h-12 bg-white/20 rounded-full` — CIRCLE shape
- **Current (line 144)**: `h-10 w-10 rounded-xl bg-white/20` — rounded rectangle, wrong size
- Fix: Change to `w-12 h-12 rounded-full bg-white/20`

### Fix 2 — NextActionCard: Title layout — icon and title are inline on SAME row (no subtitle slot)
- **Reference (HTML line 413)**: title `text-xl font-bold` next to the icon in a flex row
- **Current (line 147-149)**: Has a `<div>` wrapper around just the h2, causing misalignment
- Fix: Flatten to `flex items-center gap-3` — icon + title on same line, no extra wrapper div

### Fix 3 — NextActionCard: Separator is MISSING in reference for non-delivered states
- **Reference**: The separator only exists between the title row and description — but in current code `Separator` renders as a visible `bg-white/20` line which is fine, but the spacing is wrong
- Fix: Keep separator but ensure `mb-4` is correct

### Fix 4 — NextActionCard: Verify/Raise buttons — Raise Dispute has NO border in reference
- **Reference (HTML line 430)**: `bg-white/10 text-white font-bold rounded-xl` — NO border
- **Current (line 173-178)**: Has `border border-white/20` — extra border not in reference
- Fix: Remove `border border-white/20` from the Raise Dispute button

### Fix 5 — NextActionCard: "Other Actions" buttons — use `text-left` + `font-semibold` not just `text-sm`
- **Reference (HTML lines 438-449)**: `px-4 py-2 bg-white/10 text-white text-sm font-semibold rounded-lg hover:bg-white/20 transition-all backdrop-blur-sm text-left flex items-center space-x-2`
- **Current (line 195-203)**: `text-sm bg-white/10 hover:bg-white/20 rounded-lg px-3 py-2` — missing `font-semibold`, `text-left`, `backdrop-blur-sm`
- Fix: Add `font-semibold text-left backdrop-blur-sm`

### Fix 6 — NextActionCard: Countdown box — text-3xl not text-4xl
- **Reference (HTML line 420)**: `text-3xl font-bold mb-1`
- **Current (line 159)**: `text-4xl font-bold tabular-nums`
- Fix: Change to `text-3xl font-bold`

### Fix 7 — NextActionCard: Countdown box — missing `font-semibold` on "Verification Countdown" label
- **Reference (HTML line 419)**: `text-sm font-semibold mb-2`
- **Current (line 158)**: `text-xs opacity-80 mb-1` — wrong size and weight, no font-semibold
- Fix: Change to `text-sm font-semibold mb-2`

### Fix 8 — NextActionCard: "Verify Item Received" button — py-4 not h-11
- **Reference (HTML line 425)**: `px-6 py-4 bg-white text-warning-600 font-bold rounded-xl`
- **Current (line 168)**: `h-11` — correct height but less padding
- Fix: Change to `py-4 h-auto` to match padding-based sizing

### Fix 9 — NextActionCard: "Other Actions" section — `mt-6 pt-6` not `mt-5 pt-4`
- **Reference (HTML line 435)**: `mt-6 pt-6 border-t border-white/20`
- **Current (line 192)**: `mt-5 pt-4 border-t border-white/20`
- Fix: Change to `mt-6 pt-6`

### Fix 10 — Timeline: Circle icons are WRONG SIZE
- **Reference (HTML line 286)**: `w-10 sm:w-12 h-10 sm:h-12 ... border-4 border-white shadow-lg`
- **Current (line 816)**: `h-10 w-10 ... border-4 border-background shadow-lg` — OK on base but missing `sm:w-12 sm:h-12`
- Fix: Add `sm:h-12 sm:w-12` responsive sizing

### Fix 11 — Timeline: Completed steps use `bg-success-100` circle (green tinted), not `bg-success/20`
- **Reference (HTML line 286-288)**: `bg-success-100 rounded-full` + inner `fa-check text-success-600`
- **Current (line 816-824)**: `bg-success/20` circle + `CheckCircle` icon (which is an outlined circle-check, not a plain check)
- Fix: Change completed circle to `bg-success/10` and use a simple Check icon (already imported as `CheckCircle` but need the right fill)

### Fix 12 — Timeline: Content cards use `border border-success-200` for completed, `border-2 border-warning-300` for current
- **Reference (HTML line 289)**: `bg-success-50 rounded-xl p-3 sm:p-4 border border-success-200` 
- **Current (line 833-838)**: `bg-success/5` (no border for completed) 
- Fix: Add `border border-success/20` for completed, keep `border-2 border-warning/30` for current, `border border-border` for pending

### Fix 13 — Timeline: Completed text colors use `text-success-900`/`text-success-700` not generic foreground/muted
- **Reference**: Title is `text-success-900` (darker), subtitle is `text-success-700`
- **Current**: Uses generic `text-foreground` / `text-muted-foreground`
- Fix: For completed steps, use `text-success` and `text-success/80` for subtitle

### Fix 14 — NextActionCard gradient: from-warning-500 to-warning-600 (reference), currently from-warning to-warning/80
- **Reference (HTML line 408)**: `from-warning-500 to-warning-600` — solid warning gradient
- **Current (line 142)**: `from-warning to-warning/80` — fades to transparent, looks washed out
- Fix: Change to `from-warning to-warning/90` or keep `from-warning to-warning/80` but ensure padding `p-6 lg:p-8`

## Files to Edit
Single file: `src/pages/BuyerTransactionDetail.tsx`

Changes spread across:
- `NextActionCard` component (lines 141-209): Fixes 1, 2, 4, 5, 6, 7, 8, 9, 14
- `TransactionTimeline` component (lines 774-857): Fixes 10, 11, 12, 13
