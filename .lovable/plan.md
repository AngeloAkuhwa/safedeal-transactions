
# Seller Dashboard Polish Pass (Phase G)

A density + clarity sweep across the six seller-facing pages. No business logic, routes, money model, or storefront code change.

## Scope

In-scope pages
- `SellerDashboard.tsx`
- `SellerTransactions.tsx`
- `SellerPayouts.tsx`
- `SellerDisputes.tsx`
- `SellerPrivateOffers.tsx`
- `SellerProfileSettings.tsx`

Out of scope
- `SellerStorefront*`, `SellerProduct*`, `SellerAnalytics`, `SellerCreateTransaction`, all detail/edit pages and storefront/marketplace components.

## Global system (touched once, reused everywhere)

### 1. Density tokens (`src/index.css`)
Add a small set of utilities the seller pages will adopt instead of one-off paddings:

```text
.sd-page          → mx-auto max-w-7xl px-4 sm:px-6 lg:px-8
.sd-page-y        → py-6 sm:py-8 (page outer rhythm — was py-8 + 8 stack)
.sd-section-y     → space-y-6 sm:space-y-8
.sd-card          → rounded-xl border bg-card shadow-sm hover:shadow-md transition-shadow
.sd-card-pad      → p-4 sm:p-5
.sd-metric        → min-h-[118px] (caps KPI height — replaces p-5 + large icons)
.sd-action        → min-h-[128px]
.sd-alert         → min-h-[76px]
.sd-eyebrow       → text-[11px] font-semibold uppercase tracking-wider text-muted-foreground
.sd-kpi-value     → text-[22px] sm:text-2xl font-bold text-foreground leading-tight
.sd-kpi-helper    → text-[11px] text-muted-foreground leading-snug
.sd-row-hover     → hover:bg-muted/40 transition-colors
.sd-fade-in-stagger → opacity-0 animation: fade-in 0.4s ease-out forwards
```

Add stagger delay helpers `.sd-delay-1 … .sd-delay-6` (40ms steps) and ensure all new animations are wrapped in the existing `prefers-reduced-motion` block (already present in `index.css`).

### 2. Sticky nav polish (`SellerNav.tsx`)
- Already `sticky top-0`; add `shadow-[0_1px_0_0_hsl(var(--border))]` plus `shadow-sm` on scroll feel by switching `border-b` to `border-b border-border/80` and `backdrop-blur-md` → `backdrop-blur-lg`.
- Reduce header height from `h-16` → `h-14` for tighter rhythm.
- Active nav link: keep underline, but add subtle bg `bg-primary/5` for clearer current-section signal on laptop widths.

### 3. Footer contrast (`src/components/landing/Footer.tsx`)
- Replace `text-background/60` body text with `text-background/75`, `text-background/50` meta with `text-background/65`, `border-background/10` with `border-background/15`.
- Add hover state `hover:text-background` already present — keep.
- Social icon container `bg-background/10` → `bg-background/15` with `hover:bg-primary` retained.
- Reduce top padding `pt-8 sm:pt-10` → `pt-7 sm:pt-9` and bottom column gap `mb-8` → `mb-6`.

## Per-page changes

### A. Seller Dashboard (`SellerDashboard.tsx` + child components)

**`SellerMetricsCards.tsx`**
- Card `p-5` → `p-4`, icon tile `h-11 w-11` → `h-9 w-9`, icon `h-5` → `h-[18px]`, value `text-2xl` → `sd-kpi-value` (~22px), helper text `text-xs` → `text-[11px]`.
- Apply `sd-metric` min-height + `h-full` so cards align flush; keep grid `lg:grid-cols-3 xl:grid-cols-6` so all six KPIs sit in one row on wide desktops, `lg:grid-cols-3` on laptops, `sm:grid-cols-2` on tablets.
- Money values: confirmed `formatCurrency` already uses `minimumFractionDigits: 2` — keep, no rounding.
- Tooltip icons: keep, but reduce to `h-3 w-3` and align inline at end of label row.
- Activity-at-a-glance chips: keep wording; tighten to `py-1 px-2.5 text-[11px]`, fixed equal min-width via `min-w-[170px]`, hover lift via `hover:-translate-y-0.5 transition-transform`.
- Stagger reveal: each card gets `sd-fade-in-stagger sd-delay-N`.

**`SellerQuickActions.tsx`**
- Card `p-5` → `p-4`, title `text-base` → `text-sm font-semibold`, description `text-sm` → `text-xs`, icon tile `h-11 w-11` → `h-9 w-9`.
- Keep the existing `xl:grid-cols-5` grid; add `sd-action` min-height for equal heights, `hover:-translate-y-0.5` for the requested subtle lift.
- Section title `text-xl` → `text-base font-semibold`.

**`SellerAlertBanners.tsx`**
- Container padding `p-4` → `px-4 py-3`, gap `gap-3` → `gap-2.5`, apply `sd-alert` min-height. Title row already wraps action button to right — keep.
- Stagger reveal across visible alerts (max 3) with 60ms delays.

**`SellerOnboardingChecklist.tsx`**
- Outer `p-6` → `p-5`, step row `p-3` → `px-3 py-2.5`. Step circles already correct size.
- Add `transition-[width] duration-700 ease-out` on the `Progress` value so it animates on first paint when it scrolls into view (use `IntersectionObserver` via the existing `sd-reveal` pattern already in `index.css`, or simply set width via `requestAnimationFrame` on mount).

**`SellerRecentActivity.tsx` (table overflow fix — the worst offender)**
- Wrap `<Table>` in a `hidden md:block` block and add a parallel `md:hidden` mobile/tablet stack of cards built from the same `activity` array:
  - Card per row: top line transaction code + status badge, second line buyer + amount, action buttons full width at bottom.
- Reduce desktop table cell padding `px-6 py-4` → `px-4 py-3`, header `px-6 py-3` → `px-4 py-2.5 text-[11px]`.
- Action button column width `w-36` → `w-32` and ensure rider QR + primary action stay visible by removing `text-xs` → keeping default sizing but use `size="sm"`.
- Add `sd-row-hover`.

**`SellerDashboard.tsx` (page shell)**
- Reduce hero+alert+metrics gradient bottom padding from `pb-8` → `pb-6`; main section `py-8` → `py-6`.
- Wrap each section in a div with `animate-fade-in` so the order is: title → alerts → metrics → recent → quick actions → trust banner.

### B. Seller Transactions (`SellerTransactions.tsx`)

- Hero block padding `py-8` → `py-6`.
- Filter row currently overflows on narrow widths — wrap in `flex-wrap` (already partially there) and convert the `Select` triggers to `min-w-[140px] flex-1 sm:flex-none`.
- **Status filter cleanup**: remove the misleading `"buyer-verification"` label and replace its `<SelectItem>` value with `awaiting-buyer-review` (label "Awaiting Buyer Review"). Keep the value mapping in the edge function intact by aliasing in the request handler at call site (`status_filter === "awaiting-buyer-review" → "buyer-verification"`).
- **Visible filter chips** (above the table): render a horizontal chip rail of preset filters when `summary` shows non-zero counts:
  - `Awaiting Your Confirmation` (existing chip — keep)
  - `In Fulfillment` → sets `statusFilter = "awaiting-delivery"`
  - `Disputed` → `disputed`
  - `Released` → `completed`
  Each chip shows its count and clears when clicked again.
- **Money column**: keep stacked Gross/Net at `md+`, but at `<md` collapse into single bold line "Net ₦x.xx" + subtle "Gross ₦y.xx" beneath in muted text. Already exact 2dp — confirmed.
- Reduce table padding `px-6 py-4` → `px-4 py-3`, header text `text-xs` → `text-[11px]`.
- Summary cards (currently below table) move *above* the table so dashboard rhythm matches the rest. Reduce `text-3xl` values → `sd-kpi-value`. Add helper text under Net Earned: "Includes paid to bank and pending bank transfer." (already partially present — make it consistent).
- Keep all status labels seller-friendly; map `delivered_awaiting_verification` label to "Awaiting Buyer Review" and `awaiting_payment` to "Awaiting Payment" (currently "Payment Pending" — align with spec).

### C. Seller Payouts (`SellerPayouts.tsx`)

- Page header `text-2xl` → `text-xl font-semibold` plus eyebrow "Payouts" using `sd-eyebrow`.
- Summary cards: replace inline `SummaryCard` definition's `p-5` → `p-4`, `h-11 w-11` icon tile → `h-9 w-9`, `text-2xl` value → `sd-kpi-value`, add `sd-metric`.
- **"How Payouts Work" 4-step flow**: keep current 4-card layout but render with explicit chevron separators between steps on `md+` (`ChevronRight` muted) so the flow direction is visual; on mobile stack vertically with a thin connector line.
  - Step 3 label "SafeDeal Releases" → "SafeDeal Reviews" (matches spec wording).
- Payout History table: reduce row padding, add `sd-row-hover`, lock action column to `w-[140px]` so "Fix payout account" never wraps off-screen. On `<md` swap table for stacked cards (mirror Recent Activity strategy).
- Right sidebar cards (`Upcoming`, `Blocked`, `Payout Account`) reduce `p-3.5` → `p-3`, headings `text-base` → `text-sm font-semibold`.
- "Blocked / Delayed" cards: confirm `View Dispute` CTA is shown when reason includes "Dispute" (already implemented — keep).
- Payout Account: increase visual weight of `masked_account_number` (`font-mono text-foreground`) so it reads clearly.
- Status badges already include `Released / Processing / Scheduled / Failed / Cancelled` — add `On Hold` mapping for `failed + retry_allowed=false` rows by passing a `display_status` from the existing data (no schema change; computed at render time using `row.failure_reason`).

### D. Seller Disputes (`SellerDisputes.tsx` + `SellerDisputeSummaryCards.tsx`)

- Hero `py-8` → `py-6`, drop the second small explanatory paragraph (already covered by trust banner) to reduce vertical bloat.
- Summary cards: `p-5` → `p-4`, icon tile `h-11 w-11` → `h-9 w-9`, value `text-2xl` → `sd-kpi-value`. Apply `sd-metric` and switch to `lg:grid-cols-5` (already correct) with `xl:grid-cols-5` retained.
- Color coding aligns with spec: Open=destructive, Awaiting=warning, Under Review=primary, Resolved=success, Blocked=warning. Already correct — keep.
- "How SafeDeal Handles Disputes" panel (`SellerDisputeTrustBanner`): re-author as 3 compact mini-cards in a single grid row (Locked Agreement Review · Evidence-Based Decisions · Payout Protection) with small icon and one-line description. (`max-h-[140px]` per card.)
- `SellerDisputeActionPanel` only renders content when `items.length > 0`; already conditional but the wrapper card always renders — wrap entire `<Card>` so empty state collapses to nothing instead of taking sidebar space.
- Dispute table padding tighten same as Payouts table.
- Footer contrast inherited from global fix.

### E. Seller Private Offers (`SellerPrivateOffers.tsx`)

- Add a 3-card summary row above the filters:
  - Total Private Offers (`offers.length`)
  - Claimed (`status === "claimed" || "purchased"`)
  - Expired / Cancelled (`status === "expired" || "cancelled"`)
  Use the same compact metric card pattern (`sd-metric`, `sd-kpi-value`).
- Filter row: keep search + status `Select`. Add `Plus` "Create Private Offer" CTA visually emphasized (`variant="default"` — already correct, ensure not faded).
- Convert table to:
  - Desktop (`md+`): keep `<table>` but reduce `p-3` → `px-3 py-2.5`, lock total column to `text-right tabular-nums`, format with explicit 2dp via shared `formatCurrency`.
  - Mobile (`<md`): render `OfferRow` as a stacked card list (item thumbnail + title, buyer line, status badge, total, expires, action button full width).
- `statusStyle` map already provides correct colors; ensure `claimed` uses success (it currently uses warning — change to `bg-success/10 text-success border-success/20`) and `linked` keeps primary, `expired` uses gray `bg-muted text-muted-foreground`. Aligns with spec ("claimed = green, expired = gray, cancelled = red/gray, active = blue").
- Show seller-friendly status text (replace underscores) — already done.

### F. Seller Profile & Settings (`SellerProfileSettings.tsx` + `components/profile/*`)

- Hero gradient height `py-8` → `py-6`.
- `PersonalInfoSection`: reduce inner card padding to 5 and tighten field spacing `space-y-4` → `space-y-3`.
- `SellerVerificationSection.tsx` — **fix region wording inconsistency**:
  - Replace the single boolean-driven row with two distinct rows:
    1. **Region eligibility** — derived from `profile.state_name`/`city_name` matching the serviceable regions list. If Lagos is supported show "Region eligible for protected transactions." (success badge).
    2. **Payout region support** — derived from `is_region_eligible` returned by backend. Only show the "Your region is not yet supported for payouts" copy here, with an explicit note that buying/selling still works.
  - This removes the contradictory "Lagos eligible" + "not supported for payouts" mismatch.
  - Verified rows use `bg-success/10 text-success`; pending uses `bg-warning/10 text-warning`; not verified uses `bg-muted text-muted-foreground` (or destructive only when blocking, e.g. payout-required).
- `SecuritySection`: ensure each row uses `hover:bg-muted/40 cursor-pointer rounded-lg px-3 py-2` for clearer interactive state.
- `NotificationPreferencesSection`: switch underlying `<Switch>` styling to use `data-[state=checked]:bg-primary` (default) but bump unchecked `bg-muted` → `bg-input` for stronger contrast against the card surface.
- `PayoutDestinationSection`: render `masked_account_number` in `font-mono text-foreground text-sm`, bank name bold, verification status badge top-right of card.
- `DangerZoneSection`: wrap in `border-destructive/30 bg-destructive/[0.03]` already correct — confirm padding `p-5` not `p-8`, and reduce title weight.
- Right sidebar `TrustSafetyPanel` and `AccountStatusCard`: reduce padding to match `sd-card-pad` and ensure both fit above the fold at laptop heights.

## Animation rules (applied via CSS only)

All animations use the existing keyframes (`fade-in`, `slide-in-right`) plus the `sd-reveal` IntersectionObserver pattern already shipping in `index.css`. New rules:
- Page H1 → `animate-fade-in` (already present in places, made consistent).
- Alerts → `sd-fade-in-stagger sd-delay-1/2/3`.
- Metric cards → same stagger across the row.
- Tables → fade in after metrics with `sd-delay-4`.
- Quick action cards → existing fade + `hover:-translate-y-0.5`.
- Status badges → no entrance bounce; rely on parent fade.
- Progress bar → CSS `transition-[width]` so width changes interpolate.

All wrapped in the existing `@media (prefers-reduced-motion: reduce)` rule which already neutralizes `animate-fade-in`, `animate-fade-in-up`, `animate-slide-in-right`, `sd-reveal`, and the new stagger utilities will be added to that block.

If JS or animation fails, content remains visible because the staggered classes set `animation-fill-mode: forwards` and the parent containers do not depend on `opacity-0` Tailwind utilities (no invisible-on-failure traps).

## Files touched

```text
src/index.css                                              (+density utilities, stagger helpers)
src/components/landing/Footer.tsx                          (contrast, padding)
src/components/seller/SellerNav.tsx                        (height, shadow, active state)
src/components/seller/SellerMetricsCards.tsx               (compact, 6-up, chip polish)
src/components/seller/SellerQuickActions.tsx               (compact, equal heights)
src/components/seller/SellerAlertBanners.tsx               (compact, stagger)
src/components/seller/SellerOnboardingChecklist.tsx        (compact, animated progress)
src/components/seller/SellerRecentActivity.tsx             (table → card on <md, tighter cells)
src/pages/SellerDashboard.tsx                              (rhythm, section padding)
src/pages/SellerTransactions.tsx                           (filter cleanup, chips, summary order, mobile cards, label tweaks)
src/pages/SellerPayouts.tsx                                (compact metrics, flow chevrons, mobile cards, Step 3 label, On Hold mapping)
src/pages/SellerDisputes.tsx                               (hero trim, action panel collapse)
src/components/seller-disputes/SellerDisputeSummaryCards.tsx (compact)
src/components/seller-disputes/SellerDisputeTrustBanner.tsx  (3 mini-cards)
src/components/seller-disputes/SellerDisputeTable.tsx        (tighter padding, hover)
src/pages/SellerPrivateOffers.tsx                          (summary cards, mobile cards, status colors)
src/pages/SellerProfileSettings.tsx                        (rhythm)
src/components/profile/PersonalInfoSection.tsx             (compact spacing)
src/components/profile/SellerVerificationSection.tsx       (split region rows, fix wording)
src/components/profile/SecuritySection.tsx                 (interactive row hover)
src/components/profile/NotificationPreferencesSection.tsx  (toggle contrast)
src/components/profile/PayoutDestinationSection.tsx        (masked-account emphasis)
src/components/profile/DangerZoneSection.tsx               (size trim)
```

No edge functions, services, migrations, or routes change.

## Acceptance check (post-implementation)

1. KPI / alert / quick-action cards measure within target heights (118 / 76 / 128 px) at desktop.
2. No horizontal body scroll at 360, 414, 768, 1024, 1280, 1440, 1920.
3. All money values render with exactly 2 decimals (no rounding).
4. No "admin" wording on any seller surface (re-grep).
5. Region row reads consistently — never simultaneously says "supported" and "not supported".
6. Animations are smooth and respected by `prefers-reduced-motion`.
7. Storefront page diff is empty (`SellerStorefront.tsx`, `SellerProduct*` untouched).
