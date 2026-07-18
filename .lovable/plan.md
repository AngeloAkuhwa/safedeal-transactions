# Polish Admin Notification Center to Match Admin Density System

The Notification Center currently uses larger, marketing-style spacing (`p-6`, `text-xl`, `gap-6`, `py-5`, `h-10` buttons, `text-2xl` KPI numbers). The rest of the admin surface (`AdminUsers`, `AdminDashboard`, `AdminEscrow`, etc.) uses the `sd-*` density tokens defined in `src/index.css` (`sd-card`, `sd-card-pad`, `sd-page-title`, `sd-kpi-value`, `sd-eyebrow`, `sd-page-sub`) plus consistent `text-xs / text-sm`, `h-8` controls, and `gap-3` grids. This plan aligns Notification Center to that same system — visuals and structure are unchanged, only typography, spacing, and card sizing.

## Scope

Only `src/pages/AdminNotifications.tsx`. No backend, no service, no route, no logic changes. Sections and copy stay 1:1 with the current design.

## Adjustments (section by section)

**1. Sticky Header (`HeaderBar`)**
- Title `text-xl font-semibold` → `sd-page-title` (`text-lg sm:text-xl`).
- Subtitle `text-sm mt-0.5` → `sd-page-sub` (`text-xs`).
- Container `py-5 px-4 md:px-8` → `py-3 sm:py-4 px-4 sm:px-6 lg:px-8`.
- Live/Sync pills: `px-3 py-1.5 text-sm` → `px-2 py-1 text-xs`.
- Header buttons: `h-10` → `h-8 text-xs`; icons `h-4 w-4` → `h-3.5 w-3.5`.

**2. KPI Cards (6 cards row)**
- Grid gap `gap-6` → `gap-3`, wrap in `sd-card sd-card-pad` (replaces raw `bg-slate-900 rounded-xl p-6`).
- Icon tile `w-12 h-12` → `w-9 h-9`, icon `h-5 w-5` → `h-4 w-4`.
- Label `text-sm` → `sd-eyebrow`.
- Big number `text-2xl` → `sd-kpi-value` (`text-base sm:text-lg lg:text-xl`).
- Helper `text-xs mt-1` → `sd-kpi-helper` (`text-[10px]`).
- Trend chip `text-xs` → `text-[10px]`.
- Enforce `min-height: 96px` via `sd-metric`.

**3. Filters card**
- Outer `p-4` / `p-6` → `sd-card sd-card-pad`.
- Labels: `text-sm` → `text-xs font-medium`.
- Inputs / selects / action buttons: `h-10` → `h-8 text-xs`; search icon `h-4` → `h-3.5`.
- Section divider heading `text-base` → `text-sm font-semibold`.

**4. Failed Deliveries table card**
- Card padding to `sd-card`; header row `p-4` → `p-2.5 sm:p-3`.
- Table headers: `text-xs uppercase` kept but shrink cell padding `px-4 py-3` → `px-3 py-2`.
- Body cells `text-sm` → `text-xs` for meta columns (Timestamp, Channel, Retry status, Failure Reason); primary user name stays `text-sm font-medium`.
- Action pills `px-3 py-1.5` → `px-2 py-1 text-[11px]`.
- Row hover uses `sd-row-hover`.

**5. Delivery Performance card**
- Wrapper `p-6` → `sd-card sd-card-pad`.
- Section title `text-lg` → `text-sm font-semibold`; subtitle `text-sm` → `text-xs`.
- Per-channel tile icon `w-10 h-10` → `w-8 h-8`, label `text-sm` → `text-xs`, percentage `text-2xl` → `text-lg font-bold`.
- Progress bar height `h-2` → `h-1.5`.

**6. Broadcast Composer sidebar**
- Card `p-6` → `sd-card sd-card-pad`, header title `text-lg` → `text-sm font-semibold`.
- Amber caution block: `text-sm` → `text-xs`, padding `p-4` → `p-2.5`.
- Form labels → `text-xs font-medium`; textarea/inputs `h-10` → `h-8 text-xs`; textarea min-height reduced to match.
- Send button `h-10` → `h-8 text-xs`.

**7. Recent Activity table card**
- Same table shrinking rules as Failed Deliveries.
- Status cells reuse existing `statusPill` classes but text becomes `text-[11px]`.

**8. Page wrapper**
- Wrap main content area in `sd-page sd-page-y sd-section-y` so vertical rhythm matches other admin pages.
- Replace inter-section spacing `space-y-6 / gap-6` → `space-y-3 sm:space-y-3.5` and `gap-3`.

## Guardrails

- Do not change section order, copy, icons, colors, or callback wiring.
- Do not touch table columns, action handlers, dialogs, or the service/edge-function layer.
- Keep dark-slate palette for KPI tiles (matches `FlaggedSummaryCards`) — only sizing tokens change.
- Verify against `AdminUsers` / `AdminFlaggedUsers` after edits so densities visually match side-by-side.

## Verification

After edits: build check, then load `/admin/notifications` and compare header height, KPI row height, and table row height against `/admin/users` — they should match within a couple of pixels.
