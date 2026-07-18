## Polish Admin System Settings — Global Density Alignment

Bring `src/pages/AdminSettings.tsx` in line with the `sd-*` density system already used by AdminDashboard, AdminNotifications, and other admin screens. No feature/logic changes — presentation only.

### 1. Page chrome
- Wrap content in `sd-page sd-page-y sd-section-y` (mirrors AdminNotifications).
- Sticky header: replace bespoke title styling with `sd-page-title` (h1) + `sd-page-sub` (subtitle). Reduce header vertical padding to `py-3` and use `text-lg sm:text-xl` via the token — matches AdminHeader density.
- Header pills (Production / All changes audited) → shrink to `text-[11px]` with `px-2 py-0.5` rounded-full, consistent with dashboard status chips.
- "View History" / "Approve & Save Changes" buttons → `h-9 text-xs` with `rounded-lg`, matching global admin button sizing.

### 2. Cards
- Replace hand-rolled `rounded-2xl border-slate-800 bg-slate-900 p-6` blocks with `sd-card sd-card-pad` and let semantic tokens drive color (`bg-card`, `border-border`) so light/dark themes both work.
- Card title row: icon tile `h-8 w-8 rounded-lg` (down from 10/12) + `h-card` title class + `text-xs text-muted-foreground` subtitle. Right-side badges → `text-[11px]` rounded-full pills.
- Section eyebrows ("BASE FEE STRUCTURE", "SPECIAL CATEGORY FEE CAPS", "Feature Toggles", "KYC Requirements", "Risk Thresholds") → apply `sd-eyebrow` utility for consistent 10px uppercase treatment.

### 3. Form controls
- Inputs/selects: standard `h-9 text-sm rounded-lg border-border bg-muted/40`, label `text-xs font-medium text-foreground`, helper `text-[11px] text-muted-foreground`.
- Toggle rows: compact `py-2` with `text-sm` label + `text-[11px]` helper.
- Grid gaps tightened from `gap-6` → `gap-3 sm:gap-4` to match dashboard density.

### 4. Callouts (amber "Production Change Impact", red "Critical: Fee Structure Update", top red banner)
- Keep colors but use `sd-alert` min-height, `p-3`, `text-xs` body, `text-sm` title. Icon shrinks to `h-4 w-4`.

### 5. Audit history timeline
- Each row → `sd-card-pad` with 8×8 icon tile, `text-sm` title, `text-[11px]` subtitle + relative timestamp.
- Previous / New value chips → `text-[11px]` mono, `px-2 py-1`, `rounded-md`.
- "View Details →" link → `text-[11px]`.

### 6. Semantic color cleanup
- Remove hard-coded `text-white`, `text-slate-*`, `bg-slate-900/950` — replace with `text-foreground`, `text-muted-foreground`, `bg-card`, `bg-background`, `border-border`. Keep only accent colors (blue/emerald/amber/red) that carry meaning, and route those through the same `bg-*/10 text-*-400 border-*/20` pattern used in `dashboard/severity.ts`.

### 7. Responsive polish
- Two-column grid (Platform Settings + Security) becomes `grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4`.
- Sticky header stacks title + actions on mobile (`flex-col sm:flex-row`).

### Files touched
- `src/pages/AdminSettings.tsx` — the only file changed. No route, service, or state changes.

### Out of scope
- Wiring to `system_settings` table, audit persistence, multi-tenant scope resolution — those remain in their existing plan.
