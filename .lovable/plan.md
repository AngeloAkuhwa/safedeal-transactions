## Scope
Tweaks to the **right sidebar of the Admin Dispute Detail screen only**. Nothing else on the page (header, left sidebar, main content cards, mobile sheet) changes.

## File
`src/pages/AdminDisputeDetail.tsx` (+ one small utility in `src/index.css`).

## Changes to the right sidebar

### 1. Hide the divider scrollbar
Add a `.no-scrollbar` utility in `src/index.css` and apply it to the sidebar `<aside>` so it still scrolls independently but no visible scrollbar shows.

```css
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { scrollbar-width: none; }
```

### 2. Match sidebar background to the dispute detail cards
- The `<aside>` and its inner section containers must use the **same semantic background + border tokens as the Buyer/Seller/Financial cards** on the same page, so the sidebar reads as one continuous surface with the rest of the screen (matches design screenshots).

### 3. Resolution Status block
- Bold white `Resolution Status` heading.
- Red-bordered, red-tinted card: red dot + `ESCALATED` label, one-line message.
- Below the card: plain stacked rows (no boxed sub-cards) — `Current Workflow Stage` (orange dot + `Escalated`), `Last Activity` (date), `Next Action` (description).

### 4. Action buttons (`SidebarBtn`) — flat rows, inline icons
Drop the large tinted icon tiles. Each button becomes a flat row matching the design.
- **Outline variant:** card-surface bg, border, rounded-md, `px-3 py-2.5 text-sm`, small (16px) inline colored icon left of label.
- **Solid variant** for Refund Buyer (emerald), Release Funds to Seller (blue), Block Payout (red), Resume Payout (emerald) — same flat shape, full-color, inline icon.

Section order with uppercase muted labels:
- `CASE CONTROL` → Move to Under Review, Request More Evidence, Assign / Reassign Agent, Escalate Further, Mark High Risk, Mark Fraud Watch.
- `RESOLUTION ACTIONS` → Refund Buyer (solid), Release Funds to Seller (solid), Partial Refund, Partial Release, Close Without Resolution, Block Payout (solid), Resume Payout (solid).
- `INVESTIGATION ACTIONS` → Add Review Note (yellow), Add Internal Note (purple), Open Investigation (orange), View Linked Transaction (blue), View Payment Record (green), View Escrow Record (red/orange), View Payout Record (purple).

### 5. Resolution Summary cards
- Bold white `Resolution Summary` heading.
- Each entity card uses the same card surface as #2: small colored icon circle (blue user for Buyer, orange store for Seller), role label muted + name bold stacked, status pill top-right with dot (green `Refund Requested`, red `Response Missing`), muted quote line below.

## Out of scope
Header, left sidebar, mobile Sheet, main content cards, data, services, dialogs, business logic — all untouched.
