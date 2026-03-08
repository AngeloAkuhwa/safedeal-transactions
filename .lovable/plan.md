

# Fix Transaction Detail Page to Match Design

## Problem
The current page uses a `max-w-4xl` single-column layout. The design actually uses a **3-column grid** (`lg:grid-cols-3`) with a **sidebar** containing Next Action (sticky), Seller Info, and Payment Summary on the right side.

## Key Differences

### 1. Layout: Single Column vs 3-Column Grid
- **Current**: `max-w-4xl mx-auto` with all cards stacked vertically
- **Design**: `max-w-7xl mx-auto` with `grid lg:grid-cols-3`. Left column (`lg:col-span-2`) has Item, Delivery, Timeline, Protection, Contact. Right column has Next Action (sticky `top-24`), Seller Info, Payment Summary.

### 2. Next Action Card: Mobile + Sidebar Duplicate
- **Current**: Single full-width gradient card
- **Design**: Two copies -- one `lg:hidden` (mobile, appears above Item Details in left column), one `hidden lg:block sticky top-24` (desktop sidebar). Both have warning gradient. Buttons: "Verify" = `bg-white text-warning-600`, "Dispute" = `bg-white/10 text-white`. "Other Actions" section with `bg-white/10` pill buttons.

### 3. Timeline: Card Rows vs Connected Vertical Line
- **Current**: Separate rounded cards per step with no connecting line
- **Design**: Vertical line (`absolute left-6 w-0.5 bg-neutral-200`) running full height. Each step has a circle (`w-10 h-10 rounded-full border-4 border-white shadow-lg`) positioned absolutely at `left-0`, with content at `pl-12`. Completed steps = `bg-success-100` circle with green checkmark + `bg-success-50` card. Current step = `bg-warning-500 animate-pulse` circle + `bg-warning-50` card with `border-2 border-warning-300`. Future = `bg-neutral-200` circle + `bg-neutral-50` card.

### 4. Contact Seller Button Style
- **Current**: `variant="outline"`
- **Design**: `bg-primary-600 text-white` (solid primary button)

### 5. Header Width
- **Current**: `max-w-4xl`
- **Design**: `max-w-7xl`

### 6. Breadcrumb Width
- **Current**: `max-w-4xl`
- **Design**: `max-w-7xl`

## Changes

### File: `src/pages/BuyerTransactionDetail.tsx`

1. Change `max-w-4xl` to `max-w-7xl` on breadcrumb bar and main content wrapper
2. Replace single-column `space-y-6` with `grid lg:grid-cols-3 gap-6 sm:gap-8`
3. Wrap Item Details, Delivery, Timeline, Protection, Contact Seller in `lg:col-span-2 space-y-6`
4. Create right sidebar column with:
   - Next Action card (`hidden lg:block sticky top-24`)
   - Seller Information card
   - Payment Summary card
5. Add mobile-only Next Action card (`lg:hidden`) inside left column, above Item Details
6. Restyle Next Action buttons: "Verify" = `bg-white text-warning-600 hover:bg-neutral-50`, "Dispute" = `bg-white/10 text-white hover:bg-white/20`. "Other Actions" = `bg-white/10` pill buttons
7. Rewrite `TransactionTimeline` component to use connected vertical line style:
   - Container: `relative` with `absolute left-6 top-0 bottom-0 w-0.5 bg-border`
   - Each step: `relative pl-12 sm:pl-16 pb-6` with circle `absolute left-0 w-10 h-10 rounded-full border-4 border-white shadow-lg`
   - Completed: green circle + `bg-success/5` content card
   - Current: warning circle with pulse + `bg-warning/5` content card with `border-2`
   - Future: gray circle + `bg-muted/50` content card
8. Change Contact Seller button from `variant="outline"` to solid primary (`bg-primary text-primary-foreground`)

| File | Change |
|------|--------|
| `src/pages/BuyerTransactionDetail.tsx` | Switch to 3-col grid layout with sidebar, rewrite timeline to vertical-line style, fix button styles |

