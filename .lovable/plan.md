

# Redesign BuyerCart.tsx to Match Reference Design

## What Changes

The current cart page uses a compact card layout with seller grouping headers. The reference design uses a more spacious layout with:

1. **Top navigation bar** instead of sidebar — the reference uses a horizontal top nav with "Cart" highlighted. However, the app already uses `BuyerSidebar`, so we keep the sidebar but match the content layout.

2. **Summary stat cards** — three cards at the top: "Total Items", "Selected for Checkout", "Needs Attention" with colored counts and circular icon backgrounds.

3. **Larger cart item cards** — each card is taller with:
   - Checkbox on far left
   - Larger product image (128px on desktop)
   - Product title, description, "Sold by [Name] [Verified badge]", category badge
   - Price and stock badge on the right side
   - Horizontal divider, then Qty controls and Remove button below
   - Selected items get a `border-2 border-primary` highlight
   - Sold out items show strikethrough price, greyed-out qty controls, "Sold Out" text instead of line total

4. **No seller grouping headers** — items are listed flat (no "Seller Name" section headers)

5. **Order Summary sidebar** redesigned:
   - "Selected Items" count row
   - "Subtotal" row
   - "Service Fee" row
   - Divider, then bold "Total"
   - "Checkout Selected Items" button
   - Trust indicators: Escrow Protected, Verified Sellers, Confirmation Window
   - Info banner: "Transactions are grouped by seller and protected individually"

6. **"Remove Selected" button** in the select-all bar (not just a count indicator)

## Technical Approach

Rewrite `src/pages/BuyerCart.tsx` to match the reference:
- Remove seller grouping — flat list of items
- Add 3 summary stat cards above the items list
- Redesign each cart item card to be taller, with the reference layout (image beside info, price+stock on right, qty row below divider)
- Selected items get `border-primary` highlight
- Sold out items: strikethrough price, grey controls, "Sold Out" label
- Update Order Summary to show Selected Items count, Subtotal, Service Fee rows
- Add trust indicators with shield/user-check/clock icons
- Add info banner at bottom of sidebar
- Add "Remove Selected" to select-all bar

No backend or edge function changes needed — purely a UI redesign of the existing page.

