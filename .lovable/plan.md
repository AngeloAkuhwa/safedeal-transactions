

# Fix Transaction Detail Page to Match Reference Design

## Key Differences Found

Comparing the reference HTML (detailsTransaction-4.txt) against the current `BuyerTransactionDetail.tsx`:

### 1. Header Card - Wrong Theme
- **Current**: Dark background (`bg-foreground text-background`) - this is the main mismatch
- **Reference**: White card (`bg-white rounded-2xl shadow-lg border border-neutral-200 p-4 sm:p-6 lg:p-8`)
- Fix: Change to `bg-card rounded-2xl shadow-lg border border-border p-4 sm:p-6 lg:p-8`
- Transaction code: `text-2xl sm:text-3xl font-bold text-foreground`
- Status badge: `bg-success/10 text-success` with icon
- Date text: `text-muted-foreground text-sm sm:text-base lg:text-lg`

### 2. Header Buttons
- **Current**: Track Order styled as primary, More Actions as text link
- **Reference**: Track Order = `bg-primary text-white font-bold rounded-xl px-4 sm:px-6 py-2.5 sm:py-3`, More Actions = `bg-muted text-muted-foreground font-bold rounded-xl` (solid secondary button, not a dropdown trigger text)
- Fix: Style both as proper rounded-xl buttons side by side

### 3. Escrow Banner
- **Current**: Inside dark header, using dark-themed colors
- **Reference**: Inside white header card, using `bg-primary/5 border-2 border-primary/20` with `text-primary` icon
- Fix: Update to light-theme primary colors

### 4. Sidebar Sticky Behavior
- **Current**: Entire sidebar (next-action + seller + payment) wrapped in one sticky container
- **Reference**: Only the next-action-card itself has `sticky top-24`; seller info and payment summary scroll normally underneath
- Fix: Move `sticky top-24` to only the NextActionCard div; seller and payment remain in normal flow

### 5. Card Styling Throughout
- **Current**: Using shadcn `Card` with `shadow-sm`
- **Reference**: `rounded-2xl shadow-lg border border-neutral-200 p-4 sm:p-6 lg:p-8`
- Fix: Add `rounded-2xl shadow-lg` classes and increase padding on all content cards (Item Details, Delivery Details, Timeline, Buyer Protection, Contact Seller, Seller Info, Payment Summary)

### 6. Breadcrumb Bar
- **Current**: `bg-muted/50 border-b border-border` - close enough, minor tweak
- **Reference**: `bg-white border-b border-neutral-200` - change to `bg-card`

## Implementation

Single file change: `src/pages/BuyerTransactionDetail.tsx`

1. **Header card** (lines 279-327): Replace `bg-foreground text-background` with `bg-card rounded-2xl shadow-lg border border-border p-4 sm:p-6 lg:p-8`, update all text colors to foreground theme
2. **Buttons** (lines 292-311): Restyle Track Order as `bg-primary text-primary-foreground font-bold rounded-xl`, More Actions as `bg-muted text-muted-foreground font-bold rounded-xl`  
3. **Escrow banner** (lines 316-326): Update to `bg-primary/5 border-2 border-primary/20`
4. **Breadcrumb** (line 268): Change `bg-muted/50` to `bg-card`
5. **Right sidebar** (lines 568-686): Restructure so only NextActionCard div gets `sticky top-24`, seller info and payment summary are outside the sticky wrapper
6. **All cards**: Add `rounded-2xl shadow-lg` and `p-4 sm:p-6 lg:p-8` padding to match reference

