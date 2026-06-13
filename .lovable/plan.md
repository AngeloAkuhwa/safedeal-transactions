## Goal

Bring `/admin/users` to a 100% visual match with the attached `Screenshift - User Directory.html` reference on both desktop and mobile, without changing already-correct wiring. The data flow, services, edge functions, summary calculations, drawer behavior, row actions, fraud hooks, URL filters, navigation, and loading/empty/error/permission states are already wired and working — those stay as-is. The remaining gap is purely presentation: the mobile layout currently renders our own simplified card feed instead of the reference mobile design, and a few desktop micro-details (avatar ring color logic, status chip wording for "Investigating"/"Active Now"/"Pending ID", and currency display) don't match the reference exactly.

## Scope

Frontend-only. No edge functions, no services, no routes, no DB.

## Files to edit

1. `src/components/admin/users/UsersMobileTopBar.tsx` — replace with reference mobile header.
2. `src/components/admin/users/UsersMobileFeed.tsx` — replace card layout with the reference's three-section card (avatar+name+status chip / two-column stats strip / 2-button + overflow action row).
3. `src/components/admin/users/UsersTable.tsx` — small polish only (currency in NGN already, keep; ensure status chip text variants match reference: "Investigating", "Active Now", "Pending ID" when applicable). Action row already matches the previously approved 7-button set; no structural change.
4. `src/pages/AdminUsers.tsx` — add the reference mobile sub-bar: a "Stats Carousel" (horizontal scroll of the 6 KPI cards on mobile, 40-width cards with icon-wrap+delta+label+value) and a "Directory Label & Filters" row ("USER DIRECTORY" + Filters button that opens the existing filters in a sheet). Desktop layout unchanged.
5. `src/components/admin/users/UsersMobileStatsScroll.tsx` (new) — horizontal-scroll carousel of summary cards for mobile, matching reference markup.
6. `src/components/admin/users/UsersAdvancedFiltersSheet.tsx` (new) — wraps existing `UsersFilters` in a bottom sheet triggered by the mobile "Filters" pill.

No new icons libraries; reuse `lucide-react` (Users, UserCheck, Flag, Star, Clock, Filter, Search, Plus, ChevronLeft/Right, Mail, Phone, IdCard, ShieldHalf, Scale, User, MoreVertical).

## Reference mapping (mobile)

Header bar (`UsersMobileTopBar`):
- Left: hamburger button (`bg-slate-800`, rounded-lg).
- Center-left: title "Users" + tiny live dot (`text-emerald-400 animate-pulse`) and `"{compact} Total"` (e.g. "347.8K Total"), uppercase tracking-tight.
- Right: search icon button (opens existing search input focus) + emerald `+` button that fires the existing "Add User is coming soon" toast.

Stats carousel (`UsersMobileStatsScroll`):
- `overflow-x-auto`, inner `flex gap-4 pb-2 w-max`.
- Six cards (Total / Verified / Flagged / New This Week / ID Verified / Email Verified) — each `w-40 bg-slate-900 border border-slate-800 p-4 rounded-2xl`, icon wrap top-left, delta chip top-right, label, big value. Same icon/color tokens as desktop `UsersSummaryCards`.

Directory label + filters pill row: "USER DIRECTORY" heading + `Filters` pill button.

Card list (`UsersMobileFeed` rewrite) — three sections per card, exactly as reference:
1. Header strip: avatar with ring color (red for flagged/investigating, emerald for trusted seller, yellow for pending), corner badge (flag / star / clock) reflecting `is_flagged` / `trust_badge === "trusted_seller"` / `status === "pending"`; name + status chip (`Investigating` red, `Active Now` emerald, `Pending ID` yellow, `Suspended` purple, `Flagged` red, `Active` emerald) + handle and "Active {relative}" or joined date.
2. Stats strip (`bg-slate-800/30 grid grid-cols-2`): left = Transactions count + `({NGN compact})` muted; right = Disputes ("{n} Active" red when active, "Clean record" muted otherwise) — OR Verification mini-icons + Volume for trusted sellers, OR Type (`Business Account`) + Disputes for business users. Selection rule:
   - if seller and trust_badge=="trusted_seller" → Verification + Volume layout
   - else if roles includes business and verification.level !== "fully" → Type + Disputes layout
   - else → Transactions + Disputes layout
3. Actions row: two stretched buttons + 12x12 overflow. Mapping:
   - If flagged/investigation: `Profile` (blue) + `Review` (slate→opens `/admin/flagged-users?u=`).
   - If active seller: `Profile` (blue) + `Transactions` (emerald-tinted outline → `/admin/transactions?user=`).
   - Else: `Profile` (blue) + `Disputes` (slate → `/admin/disputes?user=`).
   - Overflow `MoreVertical` opens a small bottom sheet listing the remaining row actions (Flag/Unflag, Suspend, Investigation, Impersonate placeholder, Export).

Pagination row at the bottom of the mobile feed: `"1 - 20 of {total}"` left, prev/page-pill/next right (emerald active page) — replaces our current generic prev/next.

Bottom tab nav from the reference is intentionally NOT ported — `AdminLayout` already owns nav chrome.

## Reference mapping (desktop)

Already matches the reference for header, summary cards, filters, and 7-button action column. Only adjust:
- Status chip label: when `status==="under_investigation"` show "Investigating"; when `status==="active"` and `last_active_at` within ~5 minutes show "Active Now"; when `status==="pending"` and id not verified show "Pending ID". Color tokens already correct.
- Avatar ring color rule: red for flagged or under_investigation, emerald for trusted_seller, yellow for pending. (Already close — just confirm and tighten.)

## Behavior preserved (no changes)

- `useQuery` + URL params + drawer open/close + filter reset + page sync.
- `performFlaggedAction` for flag/clear/suspend with `ActionConfirmDialog`.
- All edge functions (`admin-users-directory`, `admin-user-detail`, `admin-users-directory-export`) and the service layer.
- Summary card data fields, formulas, and hint strings already aligned to the previous reference pass.

## Verification

- Resize to 875px (current viewport): mobile header, stats carousel, label+filters pill, card list, mobile pagination all render and match reference markup class-for-class.
- Resize to ≥1024px: desktop header, 6-card grid, filters bar, and 9-column table render exactly as the reference; only one filters bar present.
- Flag/Unflag/Suspend from a mobile card still triggers `ActionConfirmDialog`; success invalidates `admin-users-directory`, `admin-user-detail`, and `admin-flagged-users` queries.
- Drawer opens from any "Profile" tap (desktop row, mobile card, URL `?u=`), and closing strips only `u` from the URL.
- No TS errors. No new dependencies.

## Out of scope

- Edge functions, services, summary math, drawer internals, routing, sidebar, fraud engine, identity flow, exports, real impersonation, real "Add user".