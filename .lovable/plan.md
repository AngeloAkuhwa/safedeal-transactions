

# Plan: Theme-Responsive Storefront + Edit Product Page Redesign

## Two Changes

### 1. Make Seller Storefront page theme-responsive

The current storefront page and sidebar use hardcoded dark colors (`#0A0B1E`, `#1E2040`, etc.) that ignore the website's light/dark theme toggle. Convert all hardcoded dark values to use Tailwind's theme-aware classes so the page looks correct in both light and dark modes.

**Files to change:**
- `src/pages/SellerStorefront.tsx` — Replace hardcoded dark backgrounds with theme classes (`bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`). Keep the same layout structure.
- `src/components/storefront/SellerStorefrontSidebar.tsx` — Convert from `bg-[#0D0F2B]` to `bg-card`/`bg-sidebar` with proper dark mode variants. Nav links use `text-muted-foreground`/`text-foreground` instead of hardcoded hex values.
- `src/components/storefront/SellerProductCard.tsx` — Replace `bg-[#1E2040]/60`, `text-white`, `text-[#8C8EAA]`, `border-[#30344F]` with `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`.
- `src/components/storefront/StorefrontShareCard.tsx` — Same conversion to theme classes.

The design intent: In **light mode**, it matches the clean white/`#FAFBFC` design from the uploaded HTML. In **dark mode**, it uses the app's standard dark theme tokens.

### 2. Redesign `SellerProductDetail.tsx` (Edit Product page)

Replace the current single-column layout with the design from the uploaded HTML, which uses:

**Layout:** Sidebar + header bar + 3/4 + 1/4 grid (`xl:grid-cols-4`, main content `xl:col-span-3`, right sidebar `xl:col-span-1`).

**Header bar:** Back button + "Edit Product" title + status badge + action buttons (Archive Product, Unpublish, Save Changes gradient button).

**Main content cards (left, col-span-3):**
1. **Product Details** — Title + Category (2-col), Short Description, Full Description textarea, Condition + Brand + Model/SKU (3-col grid)
2. **Product Media** — Grid of image thumbnails with hover overlay (edit/delete buttons), primary indicator dot, "+" upload placeholder
3. **Pricing & Stock** — Unit Price (with ₦ prefix) + Stock Quantity (2-col), helper text "You'll be notified when stock runs low"
4. **Agreement & Delivery** — Seller Notes textarea, Delivery Method select + Verification Window select (2-col), helper text
5. **Visibility & Status** — 3-col radio card selector (Public / Buyer Specific / Private Draft) with icons and descriptions, selected state has primary border + bg tint

**Right sidebar (col-span-1):**
1. **Product Status card** — Status badge, Stock (colored), Views count, Last Updated. Below: "Preview Product" and "View on Storefront" buttons
2. **Quick Actions card** — Duplicate Product, Share Product, Archive Product (danger styled)
3. **SafeDeal Protection card** — Trust messaging

**Key differences from current implementation:**
- Replace `SellerNav` top bar with `SellerStorefrontSidebar` (same sidebar used on storefront page)
- Remove `<Footer />`
- Use `flex h-screen overflow-hidden` layout like storefront page
- Cards use `rounded-2xl border border-border shadow-sm` with header sections that have `border-b`
- All inputs: `px-4 py-3 rounded-lg border` styling
- Visibility uses radio cards instead of a dropdown select

**Files to change:**
- `src/pages/SellerProductDetail.tsx` — Full rewrite of the return JSX. Keep all existing state, queries, mutations, and handlers. Add the sidebar layout wrapper, redesigned header, 4-column grid with all 5 main cards + 3 right sidebar cards. Use theme-aware classes throughout.

**New fields shown in design but not currently in the form:**
- Brand and Model/SKU — add as local state fields, include in save payload (the edge function and DB may need these later; for now they are UI-only fields that get sent but may be ignored by the backend)
- Verification Window — add as local state with select options (24h, 48h, 72h, 1 week)

**No new components needed** — the right sidebar cards and visibility radio selector are simple enough to inline.

## What stays the same
- All data fetching, mutations, services, edge functions
- All routing paths
- `SellerStorefrontSidebar` component (reused as-is, just made theme-responsive)
- Filter logic on storefront page
- Product card click → `/seller/storefront/:id`

