

# Redesign Add Product Page — Single-Page Sidebar Layout

## Overview

Replace the current multi-step wizard with a single scrollable page matching the design: sidebar layout (reusing `SellerStorefrontSidebar`), all sections visible at once, with header bar containing Back button + "Save Draft" + "Publish" actions.

## Changes — `src/pages/SellerProductCreate.tsx`

**Full rewrite of the JSX structure.** All existing state, queries, mutations, upload logic preserved.

### Layout
- Remove `SellerNav` + `Footer` + step wizard
- Use `flex h-screen overflow-hidden` with `SellerStorefrontSidebar` on the left
- Scrollable main area with `max-w-[1200px]` content

### Header Bar
- Back button (arrow-left in rounded border box) + "Add Product" title + "Create a new product listing for your public store" subtitle
- Right side: "Save Draft" outline button + gradient "Publish" button with check icon

### All Sections Visible (No Steps)

1. **Product Details** — icon `Info` + subtitle "Basic information about your product". 2-col: Title + Category. Full-width: Short Description. Full-width: Full Description textarea. 3-col: Condition (select) + Brand (input) + Model/SKU (input)

2. **Product Media** — icon `ImageIcon` + subtitle. Large dashed upload area with cloud icon, "Upload Product Images" heading, "Drag and drop..." text, "Choose Files" primary button, file size note. Below: thumbnail grid of uploaded files + "+" placeholder

3. **Pricing & Stock** — icon `Banknote` + subtitle. 2-col: Unit Price (₦ prefix) + Stock Quantity. Helper text "You'll be notified when stock runs low"

4. **Agreement & Delivery** — icon `Handshake` + subtitle. Seller Notes textarea. Below: 2-col layout with Delivery Methods **checkboxes** (keeping existing 6 options grid) + Verification Window select (24h/48h/72h/1 week). Helper text under Verification Window

5. **Visibility & Status** — icon `Eye` + subtitle. 3-col radio cards: Public (Globe icon, primary), Buyer Specific (Users icon, warning), Private Draft (Lock icon, muted). Selected state: `border-primary bg-primary/5`

6. **Bottom Bar** — SafeDeal Protection trust strip (shield icon + text) + Cancel button + "Create Product" gradient button

### Card Styling
- `rounded-2xl border border-border shadow-sm`
- Header: `p-6 border-b border-border` with icon + title + subtitle
- Body: `p-6 space-y-6`
- All inputs: `px-4 py-3 rounded-lg border`

### What's Removed
- Step wizard, progress bar, Previous/Next navigation
- `SellerNav` top bar, `Footer`
- Agreement Terms field (state kept, not rendered)

### What's Kept
- All state variables, queries, mutations, file upload logic
- Delivery methods as checkboxes (user's explicit request)
- All existing `DELIVERY_OPTIONS` array
- `canNext()` validation adapted for single-page (check title + description + price)

## File
- `src/pages/SellerProductCreate.tsx` — full rewrite of return JSX + remove step state + remove unused imports

