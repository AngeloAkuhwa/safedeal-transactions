

# Redesign Transaction Detail Page to Match Design

## Key Differences Between Current Implementation and Design

The current implementation has significant layout and styling differences from the reference design:

### 1. Layout: Sidebar vs Single Column
- **Current**: 3-column grid (2 cols main + 1 col sidebar) with Next Action, Seller Info, and Payment Summary in sidebar
- **Design**: Single-column stacked layout. ALL cards are full-width. No sidebar.

### 2. Header: Blue Hero vs White Card
- **Current**: Blue `bg-primary` hero section with white text, back link inside hero
- **Design**: Neutral gray top bar with "Back to My Purchases" link, then a white card below with transaction code, status badge, "Track Order" text link, "More Actions" text link, and escrow banner nested inside the same card

### 3. Escrow Banner
- **Current**: Separate full-width strip below the hero
- **Design**: Nested inside the header card as a light blue/cream sub-section

### 4. Next Action Card
- **Current**: Sidebar card on desktop, top on mobile, with warning border
- **Design**: Full-width gradient card (warning-500 to warning-600 gradient, dark background with white text), appears above Item Details. Large countdown timer centered. Verify/Dispute buttons styled as large full-width buttons.

### 5. Item Details
- **Current**: Small 24x24 placeholder icon, details in grid
- **Design**: Large product image (roughly 50% width), details on right side with icon-prefixed attributes (layers icon for Quantity, star for Condition, tag for Category). Two-column grid layout within the card.

### 6. Delivery Details
- **Current**: Stacked layout, small evidence thumbnails
- **Design**: Two-column layout -- delivery info (method, expected date, destination) on the LEFT, delivery evidence images (larger, side by side) on the RIGHT with courier reference below

### 7. Transaction Timeline
- **Current**: Connected dots with vertical lines, circle icons (40px)
- **Design**: Each step is a separate card/row with a checkmark circle icon (green for completed, gray outline for pending). Steps have spacing between them (no connecting line). Cards have subtle background.

### 8. Seller Information
- **Current**: In sidebar, compact card
- **Design**: Full-width card, larger avatar, verified badge next to name, "4.9 * 127 transactions" below, table rows with dividers for Member Since / Response Time / Verification Status

### 9. Payment Summary
- **Current**: In sidebar, compact
- **Design**: Full-width card, Total Paid in large blue/primary text, Money Status in a sub-card with lock icon, Download Receipt button at bottom

### 10. "Other Actions" in Next Action
- **Current**: Ghost buttons for Download Receipt, Contact Support, Report Issue
- **Design**: Same but styled slightly differently

## Changes Required

### File: `src/pages/BuyerTransactionDetail.tsx` (full rewrite of layout)

1. **Remove blue hero section**. Replace with:
   - A neutral gray bar with "Back to My Purchases" link
   - A white Card containing: transaction code + status badge, created date, Track Order link + More Actions dropdown, and the escrow protection banner nested inside

2. **Remove 3-column grid layout**. Use single-column layout (`max-w-4xl mx-auto`) for all content cards stacked vertically.

3. **Next Action Card**: Full-width, gradient background (warning colors), white text, large centered countdown, full-width buttons. Appears between header card and Item Details.

4. **Item Details Card**: Two-column grid inside -- large image placeholder on left (~50%), details on right with icon-prefixed attributes.

5. **Delivery Details Card**: Two-column internal layout -- delivery info on left, evidence images + courier ref on right.

6. **Transaction Timeline**: Remove connected-dot style. Use separate rounded card/rows per step. Green checkmark circle for completed steps, gray circle for pending. No connecting vertical line.

7. **Buyer Protection Card**: Full-width, with nested sub-card for "Your Money is Protected" section.

8. **Contact Seller Card**: Full-width, centered "Send Message to Seller" button.

9. **Seller Information Card**: Full-width, larger layout with avatar, verified badge, rating + transaction count, table rows with dividers.

10. **Payment Summary Card**: Full-width, Total Paid in large primary-colored text, Money Status in sub-card with lock icon, Download Receipt at bottom.

11. **Remove sidebar-specific responsive logic** (`lg:hidden`, `hidden lg:block` splits for NextActionCard).

### No backend or edge function changes needed -- this is purely a UI/layout refactor.

| File | Change |
|------|--------|
| `src/pages/BuyerTransactionDetail.tsx` | Rewrite layout from sidebar grid to single-column stacked, match design styling for header, timeline, cards |

