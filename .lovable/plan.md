

# Plan: Match Payment Summary Page to HTML Design

## Key Design Differences Found

Comparing the HTML design (`main_2-4.html`) to the current `BuyerPaymentSummary.tsx`, here are the gaps:

### 1. Escrow Protection Card — Should be gradient blue hero card (not a flat info strip)
**Design**: Full-width gradient card (`bg-gradient-to-br from-primary-600 to-primary-700`) with white text, containing 4-step escrow flow (Step 1–4 with icons inside semi-transparent boxes), a "Critical: Seller is NOT paid immediately" callout inside the card, and 3 green checkmark bullet points.
**Current**: Flat `bg-primary/5` strip with icon + text. Missing the 4-step flow, missing the critical callout, missing gradient styling.

### 2. Current Status — Should be two colored cards in a grid (not a centered strip)
**Design**: White card with header ("Current Status" with chart icon + border-bottom), containing a `grid sm:grid-cols-2` with:
- Warning-colored card (yellow bg) for "Awaiting Payment"
- Danger-colored card (red bg) for "Not Yet Secured"
- Below: neutral info box with "Required Action" text
**Current**: Centered horizontal strip with muted bg. Completely different layout.

### 3. What Happens After Payment — Step number styling
**Design**: Square `rounded-lg` step indicators with colored backgrounds (step 1 = success-100, steps 2-4 = primary-100). No connecting vertical lines. Section has header with icon + border-bottom separator.
**Current**: Round circles with connecting vertical lines. No header separator.

### 4. Payment Summary — Fee labels and total amount styling
**Design**: Has "SafeDeal Protection Fee" and "Processing Fee" as separate lines (both $0.00 in mockup but our dynamic data replaces this with Service Fee). Total amount is `text-3xl font-bold text-primary-600`. Protection box uses `bg-primary-50 border-primary-200` (blue tint, not green).
**Current**: Total is `text-xl`. Protection box uses green tint.

### 5. Payment Method — Card with radio indicator, card brand icons, card form inside the selected card
**Design**: Each method card has a radio circle indicator on the right. Card option shows Visa/Mastercard/Amex/Discover brand icons. The card form (number, expiry, CVV, cardholder name) is rendered *inside* the selected card div, not below it. Grid is `grid-cols-2` for expiry/CVV, cardholder name is its own row.
**Current**: Grid layout with cards side by side. No radio indicators. No brand icons. Card form is below the grid, and uses `grid-cols-3` for expiry/CVV/name all in one row.

### 6. Billing Address — grid layout
**Design**: First/Last name in `grid-cols-2`, street address full width, City/State/ZIP in `grid-cols-3`.
**Current**: Same structure but matches. Minor: design has specific placeholder text.

### 7. Critical Warning — danger bg, not card border
**Design**: `bg-danger-50 border-2 border-danger-300` with bullet points (small circles, not checkmarks). Uses `<strong>` emphasis.
**Current**: Card with `border-destructive/40`, uses checkmark icons.

### 8. Escrow Payment Agreement — neutral bg card, not white card
**Design**: `bg-neutral-50 border border-neutral-300 rounded-2xl` with file-contract icon. The "You retain full control" list is inside a white inner box. Checkbox is a simple native checkbox.
**Current**: White Card component. List is not in an inner box.

### 9. Sidebar — Protection card gradient
**Design**: "Your Protection" card has `bg-gradient-to-br from-success-600 to-success-700` green gradient with white text and check icons.
**Current**: Plain white card with green text checkmarks.

### 10. Processing Overlay — white card with custom spinner
**Design**: Dark overlay with white rounded card (`rounded-3xl`), custom CSS spinner (border-based), blue info box.
**Current**: Uses Loader2 icon, no card wrapper, no info box.

### 11. Success Modal — larger, more detailed
**Design**: `rounded-3xl`, 20x20 success icon, `text-3xl` title, green "What happens next?" info box, two buttons.
**Current**: Smaller `rounded-2xl`, 16x16 icon, `text-2xl` title.

### 12. Failed Modal — support contact link
**Design**: Has "Need help? Contact Support" link at bottom.
**Current**: Missing support link.

## Implementation

Rewrite `src/pages/BuyerPaymentSummary.tsx` to match the HTML design pixel-for-pixel. All changes are purely visual/structural within this single file. Key structural changes:

1. **Escrow Protection** → Full gradient card with 4-step flow, critical callout, checkmarks
2. **Current Status** → White card with grid of warning/danger sub-cards + required action box
3. **What Happens** → Square step indicators, header with icon + border separator
4. **Payment Summary** → Total in `text-3xl text-primary`, blue-tinted protection box
5. **Payment Method** → Stacked cards (not grid), radio indicators, brand icons (text placeholders), form inside selected card, `grid-cols-2` for expiry/CVV
6. **Critical Warning** → `bg-destructive/5 border-2 border-destructive/30`, bullet dots not checkmarks
7. **Escrow Agreement** → Muted bg wrapper, inner white box for control list
8. **Sidebar Protection** → Green gradient card with white text
9. **Modals** → Larger rounded corners, custom spinner, support link on failed modal

No backend changes. No new files. Single file edit: `src/pages/BuyerPaymentSummary.tsx`.

