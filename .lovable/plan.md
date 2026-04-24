
# Plan: Fix dashboard data accuracy, add Disputes tooltips, add public marketplace to landing

Two workstreams. No DB migrations, no state-machine changes. Info-tip icon placement stays exactly as it is today (inline next to label) — only **adding missing tooltips** to the Disputes cards.

---

## Part 1 — Add missing info-tips to Disputes summary cards

**Problem:** On the Seller Disputes page, only the "Payouts Blocked" card currently has an ⓘ tooltip. The other 4 cards (Open Disputes, Awaiting Your Response, Under Review, Resolved) have no explanation, so sellers can't tell exactly what each count includes.

**Fix:** Keep the existing inline ⓘ pattern (icon next to the label). Just add `tooltip` copy to the other 4 cards so all 5 cards have one.

**File to change:**

- **`src/components/seller-disputes/SellerDisputeSummaryCards.tsx`** — add `tooltip` field to each of the first 4 cards. Render the same inline ⓘ button next to the label that "Payouts Blocked" already uses.

**Tooltip copy:**
- Open Disputes: "Active dispute cases not yet resolved. Includes both cases where you need to respond and cases SafeDeal is reviewing."
- Awaiting Your Response: "Cases where SafeDeal needs your evidence or rebuttal. Always respond before the deadline shown on each case."
- Under Review: "SafeDeal is weighing both sides. No action needed from you right now — we'll notify you when there's an update."
- Resolved: "Cases with a final outcome — funds released, refunded, or partially refunded."
- Payouts Blocked: existing copy stays.

No layout changes, no badge changes, no card restructuring.

---

## Part 2 — Fix dashboard data accuracy & wording inconsistencies

Verified against the database for Chioma. Two real bugs and one semantic ambiguity:

### Bug 2A — "Net Revenue Released" disagrees between Dashboard and Transactions tabs

| Page | Card | Source | Value |
|---|---|---|---|
| Dashboard | "Net Revenue Released" | sum of `payouts.amount` where `status='completed'` | ₦926,250.00 |
| Transactions | "Net Earned (Completed)" | sum of `seller_net_amount` where `tx.status='completed'` | ₦957,965.00 |

Same word ("released" / "completed") covers two different concepts (escrow released vs. bank transfer completed). We already fixed this on the Transactions page in the previous loop. Apply the same fix on Dashboard:

- **`supabase/functions/seller-dashboard/index.ts`**: change `payouts_completed_amount` to sum `seller_net_amount` for transactions with `status='completed'` (matches Transactions tab). Also expose two new fields:
  - `net_paid_to_bank` — sum of `payouts.amount WHERE status='completed'` (currently ₦926,250)
  - `net_pending_bank_transfer` — `payouts_completed_amount - net_paid_to_bank` (currently ₦31,715)
- **`src/services/seller-dashboard.service.ts`**: extend `SellerMetrics` with the two new fields.
- **`src/components/seller/SellerMetricsCards.tsx`**: rename "Net Revenue Released" → **"Net Earned (Completed)"**, subtitle becomes "Net released to you · payout in progress for some", and show breakdown line "₦X paid to bank · ₦Y pending bank transfer" if `net_pending_bank_transfer > 0`. Update the existing tooltip to explain both numbers.

### Bug 2B — "Awaiting Buyer Review" card on Dashboard means a different thing than the Transactions tab uses it

Current Dashboard logic sums `awaiting_buyer` (4 tx, ₦5,431,349.97 — buyer hasn't even opened the share link yet). But sellers reading "Awaiting Buyer Review" expect the transaction status `delivered_awaiting_verification` (item delivered, buyer reviewing item before releasing funds), which is exactly what the Transactions table uses the same label for. Two different things, identical labels.

- **`src/components/seller/SellerMetricsCards.tsx`**: rename the card "Awaiting Buyer Review" → **"Awaiting Buyer to Open Link"**.
  - Subtitle: "Gross amount · share link not opened/agreement not reviewed yet"
  - Tooltip: "Buyers you've sent a transaction link to, but they haven't opened or reviewed the agreement yet. Send them a reminder if it's been more than a day."

This makes the card semantically distinct from the table's "Awaiting Buyer Review" status (post-delivery).

### Verification 2C — other Dashboard cards (no fixes needed)

- Transactions Created: 17 ✅
- Awaiting Buyer Payment: ₦38,586 ✅ (3 × buyer_total)
- Funds Held in Escrow: ₦1,998,750 ✅ (seller_net of `funds_held_in_escrow`)
- Funds Pending Release: ₦0.00 ✅

### Verification 2D — Payouts page

All four cards already correct after the previous loop's fixes. **No changes** beyond the tooltip copy that's already there.

### Verification 2E — Disputes page numbers

- Open Disputes: 1 ✅
- Awaiting Your Response: 0 ✅
- Under Review: 1 ✅
- Resolved: 1 ✅
- Payouts Blocked: ₦906,750 ✅ (2 disputed × seller_net)

Disputes data is correct — only the **missing tooltips** (Part 1) need fixing.

---

## Part 3 — Add public marketplace to the landing page

### Goal
Let public visitors browse the marketplace from the landing page without disturbing the carefully tuned landing rhythm. Authentication still required to add to cart / pay (the existing `PurchaseAuthModal` already handles this — `MarketplaceProductCard` triggers it when `!isAuthenticated`).

### Where it goes on the landing page
Insert a new section **between `<TrustBanner />` and `<HowItWorks />`** in `src/pages/Index.tsx`. This slot works because:
- TrustBanner ends the "why SafeDeal" upper section with a confident note.
- A live product preview here gives visitors something concrete to look at before they're asked to read "How it works".
- HowItWorks then naturally follows by explaining what they just saw.

### What the section looks like (compact, doesn't disturb landing rhythm)

**`src/components/landing/MarketplacePreview.tsx`** (new file):
- Section header: "Browse the marketplace" + subtitle "Real listings from verified sellers on SafeDeal. Browse freely — sign up only when you're ready to buy."
- A grid of 8 product cards (responsive: 2 cols mobile, 3 tablet, 4 desktop) showing newest published, public, in-stock products.
- Reuse the existing `MarketplaceProductCard` (already shows seller, price, trust badge, in/out of stock, and triggers `PurchaseAuthModal` for cart actions when logged-out).
- Bottom CTA: "Browse all listings →" linking to `/marketplace` (a new public route — see below) for visitors, or `/dashboard/marketplace` for buyers.
- Empty / loading state matches landing page tone (skeleton cards + soft fallback "More listings coming soon — sellers are joining daily").

### New public marketplace route

The full `BuyerMarketplace` page is currently locked behind `/dashboard/marketplace` (auth-protected). The marketplace edge function has `verify_jwt = false` and already returns data without auth, so no backend changes needed.

- Add a new public route `/marketplace` in `src/App.tsx` rendering the same `BuyerMarketplace` component. The component already uses `useAuthState()` and `PurchaseAuthModal`, so unauthenticated users can browse, search, filter, view detail, save heart (gated), add to cart (gated by modal).
- For the public version, the existing `BuyerSidebar` has buyer-dashboard links — wrap it conditionally so it only shows when authenticated; logged-out visitors see just the catalog grid + filters in full width.

### Header / nav update

- **`src/components/landing/Header.tsx`**: add "Marketplace" as the first link (before "How It Works"), pointing to `/marketplace`. Keep all other links unchanged.

### Auth-gated actions remain enforced

No changes needed to:
- `MarketplaceProductCard` — already shows `PurchaseAuthModal` when logged-out user clicks add-to-cart or save.
- Cart / checkout flow — already requires auth.
- Product detail (`PublicProductDetail`) — already exists and already shows the same purchase-auth modal.

---

## Files changed

**Part 1 (Disputes tooltips):**
- `src/components/seller-disputes/SellerDisputeSummaryCards.tsx`

**Part 2 (data + labels):**
- `supabase/functions/seller-dashboard/index.ts`
- `src/services/seller-dashboard.service.ts`
- `src/components/seller/SellerMetricsCards.tsx`

**Part 3 (public marketplace):**
- `src/components/landing/MarketplacePreview.tsx` (new)
- `src/pages/Index.tsx` (insert section)
- `src/components/landing/Header.tsx` (add "Marketplace" nav link)
- `src/App.tsx` (add public `/marketplace` route)
- `src/pages/BuyerMarketplace.tsx` (conditionally hide sidebar when logged-out; rest unchanged)

## What stays the same
- Existing inline ⓘ icon placement on every card across Dashboard, Transactions, Payouts, Disputes — **not touched**.
- All money formatting (₦ with 2 decimals, no K/M).
- Money state machine, RLS policies, payout pipeline.
- The Transactions tab "Net Earned (Completed)" card (already fixed last loop).
- Authentication guards on cart, checkout, save-product.
- Hero, FraudPrevention, BestForSection, HowItWorks, FAQ — landing layout and rhythm preserved.

## Verification after implementation
- Each of the 5 Disputes cards now shows an ⓘ icon next to the label with plain-language meaning on hover.
- Dashboard "Net Earned (Completed)" reads ₦957,965.00 with breakdown line "₦926,250.00 paid to bank · ₦31,715.00 pending bank transfer" — matches the Transactions tab exactly.
- Dashboard "Awaiting Buyer to Open Link" replaces the ambiguous "Awaiting Buyer Review" card with a clearer label.
- Visiting `/` shows a "Browse the marketplace" section with 8 live product cards before "How It Works".
- Visiting `/marketplace` while logged out shows the full marketplace; clicking add-to-cart or heart opens the auth modal.
- Logged-in visitor sees "Marketplace" link in the landing header and lands on the same public page.

## Risk
Low. All changes are additive UI/copy or label corrections, plus one edge-function field addition (already-correct math, just exposed). No state-machine, no RLS, no DB schema, no money movement.
