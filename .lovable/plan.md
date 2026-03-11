

# Perfect Seller Dashboard — Sizing & Design Refinements

## Summary
Update all seller dashboard components to match the uploaded HTML design exactly, with properly fitted font sizes, card dimensions, spacing, and visual details.

---

## Changes by Component

### 1. `SellerNav.tsx`
- Active nav link: add `border-b-2 border-primary pb-1` underline + `text-primary` color (design: `text-primary-600 font-semibold border-b-2 border-primary-600 pb-1`)
- Logo icon: wrap in `w-10 h-10 bg-primary rounded-lg` container with white shield icon (currently just bare icon)

### 2. `SellerAlertBanners.tsx`
- Change from `rounded-xl border p-4` to `border-l-4 rounded-lg p-4 shadow-sm` (left accent, not full border)
- Border colors: `border-amber-500`, `border-primary`, `border-green-500`
- Backgrounds: `bg-amber-50`, `bg-sky-50`, `bg-green-50`
- Replace `<Button variant="outline">` with a text-only link: `text-sm font-semibold` + arrow-right icon
- Title text: use darker tone (e.g., `text-amber-900`) instead of `text-warning`
- Body text: `text-sm` (not `text-xs`) with `text-amber-700` etc.

### 3. `SellerDashboardHero.tsx`
- Add "Seller Dashboard" label above title: Store icon + `text-sm font-semibold text-muted-foreground`
- Title: keep `text-3xl lg:text-4xl` (already close, just ensure `lg:text-4xl`)
- Subtitle: `text-base text-muted-foreground` (not `text-sm`)
- CTA button: `px-6 py-4 rounded-xl shadow-lg` with `PlusCircle` icon (currently `Plus` with default size)
- Add decorative blur circles with `opacity-5` behind content
- Background: `bg-gradient-to-br from-sky-50 via-white to-green-50` (not `from-success/10`)
- Add `relative overflow-hidden` for blur orbs

### 4. `SellerMetricsCards.tsx`
- Grid: `lg:grid-cols-4` (not `lg:grid-cols-5`) with `gap-6`
- Card: `rounded-2xl shadow-lg hover:shadow-xl transition-all p-6` (currently `p-5`, no shadow)
- Icon container: `w-12 h-12` (currently `h-10 w-10`), icon: `text-xl` size
- Add badge pill top-right: `inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold` with per-card labels ("↑ 12%", "Pending", "Escrow", "Releasing", "Paid")
- Value: `text-3xl font-bold` (currently `text-xl`)
- Label: `text-sm font-medium` (currently `text-xs font-medium`)
- Subtitle: `text-xs text-muted-foreground`
- Layout: icon + badge row at top with `flex items-start justify-between mb-4`, then `space-y-1` for value/label/subtitle

### 5. `SellerRecentActivity.tsx`
- Card wrapper: `rounded-2xl shadow-lg` (matching design)
- Header: two-line title (`text-2xl font-bold` + `text-sm text-muted-foreground` subtitle), with search input + filter button on right
- Search: `pl-10 pr-4 py-2 border rounded-lg text-sm` with search icon
- Filter: `px-4 py-2 border rounded-lg text-sm font-medium` with filter icon
- Table headers: `px-6 py-4 text-xs font-semibold uppercase tracking-wider` (currently default shadcn)
- Table cells: `px-6 py-4` padding
- Transaction code: add Shield icon before code text
- Amount: `text-sm font-bold` (currently `font-semibold`)
- Action column: contextual buttons per status — "Update Delivery" (primary filled), "View Details" (outline), "View Receipt" (outline), "View Link" (outline)
- Add pagination footer: "Showing 1-6 of N" + page number buttons

### 6. `SellerQuickActions.tsx`
- Section title: `text-2xl font-bold mb-6` (currently `text-lg mb-4`)
- Grid gap: `gap-6` (currently `gap-4`)
- Card: `rounded-xl shadow-md p-6 hover:shadow-lg` (currently `p-5`)
- Icon: `w-12 h-12` (currently `h-10 w-10`), icon size `text-xl`
- Title: `text-lg font-bold mb-2` (currently `text-sm font-semibold`)
- Description: `text-sm` (currently `text-xs`)
- Hover: icon bg transitions to solid color, icon turns white (`group-hover:bg-green-600`, `group-hover:text-white`)
- Update descriptions to match design exactly

### 7. `SellerTrustBanner.tsx`
- Background: `bg-gradient-to-r from-sky-600 to-green-600` (dark gradient, not light)
- All text: white
- Add decorative white opacity circles
- Title row: Shield icon + "SafeDeal Protection Active" label in white
- Heading: `text-3xl font-bold text-white`
- Body: `text-white/90`
- Stat boxes: `bg-white/20 backdrop-blur-sm rounded-xl px-6 py-4` with `text-3xl font-bold text-white` value and `text-sm text-white/90` label
- Remove the separator line between stats

### 8. `SellerDashboard.tsx`
- Wrap alerts + hero + metrics in a unified `bg-gradient-to-br from-sky-50 via-white to-green-50` background section
- Sections below (recent activity, quick actions, trust banner) use `bg-muted/50` or neutral background
- Adjust section spacing: `py-8` for metrics and activity sections (currently `mt-4 mb-8` etc.)
- Remove `border-b` from hero since gradient flows seamlessly

---

## Files Changed (8 files, all edits)

| File | Key sizing fixes |
|------|-----------------|
| `SellerNav.tsx` | Active link underline, logo container |
| `SellerAlertBanners.tsx` | `border-l-4`, text links, proper tint colors |
| `SellerDashboardHero.tsx` | Label, `lg:text-4xl`, larger CTA, blur orbs |
| `SellerMetricsCards.tsx` | 4-col grid, `text-3xl` values, `w-12 h-12` icons, badge pills, `p-6` |
| `SellerRecentActivity.tsx` | Search/filter, `text-2xl` header, contextual actions, pagination |
| `SellerQuickActions.tsx` | `text-2xl` section title, `text-lg` card titles, `w-12 h-12` icons, hover transitions |
| `SellerTrustBanner.tsx` | Dark gradient, white text, `text-3xl` stats, `bg-white/20` boxes |
| `SellerDashboard.tsx` | Unified gradient wrapper, neutral bg for lower sections |

