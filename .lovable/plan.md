# Central Admin Dashboard — `/admin/dashboard`

Build a production-style SafeDeal admin operations control center matching the uploaded desktop + mobile references. Static demo data initially, but every section is structured (typed service contract, named props) so swapping to a real edge function later is one line. NGN currency throughout, always via `formatMoney(value, "NGN")` so values render with exact 2 decimal places.

## Scope

### 1. Admin role gate
- The `app_role` enum already includes `admin` and `has_role()` exists. No DB migration needed.
- `ProtectedRoute` already accepts any role string; just verify and gate `/admin/*` with `requireRole="admin"`.
- Existing `/admin/offers` and `/admin/offers/:id` routes inherit the same gate.

### 2. Route
- `/admin/dashboard` (canonical landing).
- Sidebar items for unbuilt subpages do **not** navigate to broken 404s — see section 6.

### 3. Reusable admin shell (`src/components/admin/`)
Designed to host every future admin page, not just the dashboard.
- `AdminLayout.tsx` — fixed slate sidebar on desktop; sticky mobile header with hamburger; slide-out drawer (uses existing `Sheet` primitive) with dark overlay; main content scrolls independently; sticky page header inside main.
- `AdminSidebar.tsx` — nav groups (Overview / Operations / Financial / Risk & Compliance / Support & Tools / Settings) with color-coded badges (orange / purple / red / yellow / cyan). Bottom block: avatar + "Admin User" + "Super Admin" + logout icon.
- `AdminHeader.tsx` — desktop: page title, subtitle, Filters button, Export Report button. Mobile: hamburger + SafeDeal Admin Portal logo + download icon.

### 4. Dashboard page composition
`src/pages/AdminDashboard.tsx` arranges these section components in this exact order:

1. **`KpiCards`** — 4 compact tiles:
   - Total Transactions: `24,583` (+12.5%)
   - **Escrow Balance: `formatMoney(124_890_000, "NGN")` — represents only funds currently held + frozen** (excludes released, excludes refunded). Tooltip clarifies "Funds currently held or frozen in escrow".
   - Active Users: `124,890` (+2.1%)
   - Flagged Activity: `1,248` (+15.3%)

2. **`AdminActionRequired`** (NEW — placed *between* KPIs and charts) — 6 compact action cards in a responsive grid (2 cols mobile, 3 cols tablet, 6 cols desktop). Each card: severity-tinted icon block, count, short label, action button. Wording is admin-portal-only ("Release Queue" / "Awaiting Release Queue") — never the buyer/seller phrasing "admin release".
   - **Awaiting Release** — both parties confirmed, payout ready for SafeDeal review. Severity: blue. Action: "Open Release Queue".
   - **Failed Payouts** — payouts requiring retry/investigation. Severity: red. Action: "Investigate".
   - **Disputes Needing Decision** — past response/review threshold. Severity: orange. Action: "Decide".
   - **Stuck Transactions** — flagged by cron or manual review. Severity: purple. Action: "Review Queue".
   - **Identity Reviews Pending** — users awaiting verification. Severity: cyan. Action: "Open Reviews".
   - **Webhook / Reconciliation Issues** — payment events needing investigation. Severity: yellow. Action: "Investigate".
   - For action buttons whose target page is not yet built, the click triggers a "Coming soon" toast (using existing `useToast`) instead of routing to 404.

3. **`TrendCharts`** — two `recharts` cards side-by-side:
   - Transactions vs Disputes Trend (7D / 30D / 90D segmented control).
   - Escrow, Releases & Refunds (last 30 days).
   - Mobile: stacks; chart body itself can scroll horizontally — page body never does.

4. **`OperationalHotspots`** — 4 cards (Overdue Responses orange, Frozen Escrow red, Flagged Today yellow, Stale Transactions purple). 2 cols mobile, 4 cols desktop.

5. **`RiskAndPaymentHealth`** — two-column desktop:
   - Dispute SLA Pressure: aging buckets (Due soon / Overdue / Escalated / Under review) as a stacked horizontal bar.
   - Payment Health: rows with colored dots (Successful 23,891 / Failed 142 / Webhook Failures 8 / Reconciliation Mismatches 3).

6. **`IdentityAndPayoutHealth`** — two cards:
   - Identity Review Health: Pending Reviews 47, Avg Review Time 2.4h, mini sparkline.
   - **Payout Health: Pending Payouts via `formatMoney(18_200, "NGN")` — represents funds awaiting release or currently processing (NOT historical released funds).** Avg Payout Time 6.2h. Mini sparkline.

7. **`AuditComplianceSignal`** (NEW) — single compact card with 5 rows:
   - Last audit log entry: relative time (e.g. "3 min ago") + actor + action summary
   - High-severity admin actions (last 24h): count + "View log" link
   - Recent impersonation sessions (last 24h): count + "View" link
   - Failed admin login attempts (last 24h): count + severity dot
   - Compliance status: badge (Green / Amber / Red) + last check timestamp

8. **`CriticalAlerts`** — alert rows with severity tints + Clear All. Demo rows: Escrow Balance Alert (red, 2h ago), Dispute Queue Overflow (yellow, 1h ago).

9. **`RecentActivity`** — icon + title + subtitle + timestamp rows. Money values render as `formatMoney(249.99, "NGN")` → `₦249.99`.

10. **`PerformanceMetrics`** — 2x2 metric grid (Transaction Success 99.8% +0.2%; Avg Processing 2.3s -0.5s; DAU 12,489 +1.2%; Dispute Resolution 48h +2h).

### 5. Service contract (`src/services/admin-dashboard.service.ts`)
Single typed entrypoint returning the full payload. Currently returns static demo data; the function signature mirrors what an `admin-dashboard` edge function will return, so the swap is one import line later.

```ts
export interface AdminDashboardResponse {
  kpis: AdminKpis;                       // includes escrow_held_plus_frozen_amount
  action_required: AdminActionItem[];    // 6 items, severity-tagged
  trends: { transactions_vs_disputes: TrendSeries; escrow_releases_refunds: TrendSeries };
  hotspots: AdminHotspot[];
  dispute_sla: DisputeSlaBuckets;
  payment_health: PaymentHealthRow[];
  identity_health: IdentityHealth;
  payout_health: PayoutHealth;           // pending_payouts_amount = awaiting release + processing
  audit_signal: AuditComplianceSignal;
  critical_alerts: AdminAlert[];
  recent_activity: AdminActivityItem[];
  performance: PerformanceMetric[];
  sidebar_badges: { disputes: number; identity: number; payouts: number; flagged_users: number; exports: number };
}
```

Page consumes via `useQuery({ queryKey: ["admin-dashboard"], queryFn: getAdminDashboard })`.

### 6. Unbuilt subpage handling
A small helper `useAdminNav()` returns `{ isBuilt, onClick }` per nav item. Built routes (`/admin/dashboard`, `/admin/offers`) navigate normally. Unbuilt routes:
- Sidebar: item stays visible but rendered with `aria-disabled`, muted styling, and a tooltip "Coming soon".
- Action buttons inside dashboard cards: click fires `toast({ title: "Coming soon", description: "This admin tool is on the roadmap." })`.

This avoids polished-prototype regressions where a confident-looking dashboard dumps the user on a 404.

### 7. Money accuracy rules (enforced)
A short doc-comment in `admin-dashboard.service.ts` codifies these for the future edge function author:
- `escrow_balance` = `funds_held_in_escrow_amount + funds_frozen_amount` only. Never includes released or refunded amounts.
- `pending_payouts_amount` = funds in `funds_pending_release` + currently-processing payouts. Never includes already-paid-out amounts.
- Released funds → counted in `payouts_completed_amount` separately, never in escrow.
- Refunded funds → must subtract from the appropriate held/frozen bucket; the demo dataset already reflects this so no UI-side double-count is possible.
- All money rendering goes through `formatMoney(value, "NGN")` — no `Intl.NumberFormat` instances in admin components, no `toFixed`, no `$`.

### 8. States, animations, responsiveness
- Loading: per-section `Skeleton` blocks (existing primitive).
- Error: page-level error card with retry button (mirrors existing `Dashboard.tsx` pattern).
- Empty: each section degrades gracefully (e.g. CriticalAlerts shows "All clear" tile when empty).
- Animations: reuse `sd-fade-in-stagger` / `sd-delay-N` for staggered card reveal; `transition-all hover:-translate-y-0.5` on cards; Sheet's built-in slide for the drawer. All respect `prefers-reduced-motion` (already handled in `index.css`).
- Responsive: sidebar fixed on lg+, drawer below; KPIs 1/2/4 cols; action-required 2/3/6 cols; charts 1/2 cols; hotspots 2/4 cols. Page never overflows horizontally.

### 9. Visual direction
Admin portal intentionally uses its own slate palette (`bg-slate-950`, cards `bg-slate-900`, borders `border-slate-800`) per the reference — visually distinct from buyer/seller surfaces. Tinted accents at `/10` fill + `/20` border (blue/emerald/purple/red/orange/yellow/cyan). Inter font (already global). Compact card heights, no oversized empty space.

## Files

**Created**
- `src/pages/AdminDashboard.tsx`
- `src/components/admin/AdminLayout.tsx`
- `src/components/admin/AdminSidebar.tsx`
- `src/components/admin/AdminHeader.tsx`
- `src/components/admin/AdminMobileHeader.tsx`
- `src/components/admin/useAdminNav.ts`
- `src/components/admin/dashboard/KpiCards.tsx`
- `src/components/admin/dashboard/AdminActionRequired.tsx`
- `src/components/admin/dashboard/TrendCharts.tsx`
- `src/components/admin/dashboard/OperationalHotspots.tsx`
- `src/components/admin/dashboard/RiskAndPaymentHealth.tsx`
- `src/components/admin/dashboard/IdentityAndPayoutHealth.tsx`
- `src/components/admin/dashboard/AuditComplianceSignal.tsx`
- `src/components/admin/dashboard/CriticalAlerts.tsx`
- `src/components/admin/dashboard/RecentActivity.tsx`
- `src/components/admin/dashboard/PerformanceMetrics.tsx`
- `src/services/admin-dashboard.service.ts`

**Edited**
- `src/App.tsx` — register `/admin/dashboard`; gate `/admin/*` with `requireRole="admin"`.

## Out of scope (explicit)
- Building linked subpages (Transactions, Disputes, Users, Payouts, Audit Logs, etc.) — only Dashboard ships now; unbuilt nav items show "Coming soon" toast/tooltip.
- Wiring real Postgres aggregations — left as a follow-up; the `AdminDashboardResponse` contract is in place so the future edge function has a fixed shape.
- Granting any user the `admin` role — must be done in DB; the gate just enforces it.
- No new dependencies (`recharts`, `lucide-react`, `Sheet`, `Tooltip`, `useToast` already exist).
