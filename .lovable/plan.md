

# Fix Payment Failed Screen to Match Design

## Differences Found

1. **Money Status Summary**: Design uses an amber/warm background (`bg-amber-50 border-amber-200`) with a 2-column grid layout (Transaction Status | Money Status) with centered text, column dividers, and label-above-badge layout. Current code uses `bg-muted/60` with inline flex badges side by side — wrong layout and wrong colors.

2. **Contact Support button**: Design says "Contact support if card appears charged" as a single button label. Current code has a separate plain "Contact Support" button with a headphones icon — missing the "if card appears charged" context.

3. **Transaction Info block**: Design uses a 2-column grid (Amount | Code) centered with divider, like the money status section. Current code uses a list-style left/right layout.

## Changes — `src/pages/BuyerPaymentSummary.tsx`

### Money Status Summary (lines 896-908)
Replace with 2-column grid matching design:
- Amber background: `bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800`
- Grid layout `grid grid-cols-2 divide-x divide-amber-200`
- Left column: "TRANSACTION STATUS" label + "Awaiting Payment" in amber badge
- Right column: "MONEY STATUS" label + "Payment Failed" in red badge
- Both centered with `flex flex-col items-center`

### Transaction Info block (lines 910-921)
Replace with same 2-column grid layout:
- `bg-muted/50 border border-border`
- Grid with divider, centered columns
- Left: "AMOUNT" label + bold amount
- Right: "CODE" label + mono transaction code in a chip

### Contact Support button (lines 951-956)
Change label from "Contact Support" to "Contact support if card appears charged"

