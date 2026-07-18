# Port System Settings page — UI 1:1

Build `/admin/settings` as a pixel-faithful port of the attached `System_Settings-2.html` reference. UI-only in this pass (local state, no DB wiring) — matches the same "port first, wire later" flow we used for Notifications.

## Scope

- Route: `/admin/settings` → new `src/pages/AdminSettings.tsx`.
- Rendered inside the existing admin shell (`AdminSidebar` + `AdminMobileHeader`) — same pattern as every other admin page. The reference HTML's own sidebar is not re-implemented; the app's sidebar already contains the same nav (Dashboard, Analytics, Reports, Transactions, Disputes 47, Identity Verification 8, Users, Investigations, Fraud Detection, Escrow, Payouts 3, Payment Audit, Funds Tracking, Refunds, Settings, Audit Logs, Notifications), so we align the sidebar item icons/labels/badges/active-state to match the reference and keep one sidebar in the app.
- Allowlist `/admin/settings` in `src/components/admin/useAdminNav.ts` so the sidebar link stops showing "Coming soon".

## Sections built (in order, 1:1 with the HTML)

1. **Sticky page header** — "System Settings" title, subtitle, `Production` amber pill, `All changes audited` chip, `View History` button, `Approve & Save Changes` amber gradient button. Below it the red-left-border banner: "⚠️ Production Environment — Changes Affect Live Transactions".
2. **Timeout Rules card** — blue-tinted header block with clock icon, "4 Business Rules" chip. Grid of 4 inputs: Seller Fulfillment Timeout (days), Buyer Verification Window (hours), Auto-Release After Delivery (hours), Payment Session Expiry (minutes). Amber "Production Change Impact" callout. Footer: "Last modified" line + blue `Update Timeout Rules` button.
3. **Fee Configuration card** — emerald header, "Active Rules" chip.
   - **Base Fee Structure** (3 inputs): Platform Fee Rate (%), Minimum Platform Fee (₦), Total Service Fee Cap (₦).
   - **Special Category Fee Caps** (2 inputs): High-value tier rate, Refund policy toggle text.
   - Red "Critical: Fee Structure Update" callout, footer with emerald `Update Fee Structure` button.
4. **Two-column row**:
   - **Platform Settings** (purple sliders icon): Feature Toggles — Auto-Release Payments (on), Email Notifications (on), SMS Alerts (off). Risk Thresholds — High-Value Transaction Alert ($10000), Fraud Risk Score Threshold (75/100).
   - **Security & Compliance** (red shield icon): KYC Requirements — Require ID Verification (on) + ID Verification Threshold ($5000). Session Security — Session Timeout (30 min) + Two-Factor Authentication (on).
5. **Recent Changes & Audit History card** — blue header with clock-rotate-left icon, `Export Full Log` button. Four activity rows exactly as HTML: Base Protection Fee Updated (2.5% → 2.9%), Seller Fulfillment Timeout Modified (5 → 7 days), SMS Alerts Feature Disabled (Enabled → Disabled), Notification Settings Updated (All → Critical only). Each row: colored icon disk, title, subtitle, timestamp, Previous/New value tiles, admin avatar + "View Details →".

## Visual fidelity

- Dark palette from the HTML: `bg-slate-950`, cards `bg-slate-900` with `border-slate-800`/`border-slate-700/50`, gradient card headers `bg-slate-800/30`, muted text `text-slate-400`, inputs `bg-slate-700 border-slate-600`. This screen is dark-only (matches admin dark theme); no light-mode tokens needed since the reference itself is dark. Same approach we used on `AdminNotifications` — hardcoded dark slate palette scoped to this admin page.
- Icons via `lucide-react` equivalents of the Font Awesome ones (Clock, Percent, Sliders, ShieldCheck, ShieldHalf, Crown, Coins, ClockRotateLeft → History, Download, ArrowRight, TriangleAlert, ToggleRight, Bell). No new icon library.
- Toggles built as small purely-visual pill components with local `useState`.
- Density and font sizes match the `sd-*` scale already used on `AdminNotifications` for consistency with the rest of the admin.
- Sticky header uses `sticky top-0 z-20` inside the admin main scroll container so the body scrolls under it — same technique as `AdminUserDetail`.

## Interactions (UI-only)

- All inputs, toggles, and buttons are wired to local component state; changing them flips the top-right `Approve & Save Changes` button into an "enabled/dirty" state (amber glow) but no network calls.
- `View History` and `Export Full Log` show a `toast` "Coming soon — will hook to admin_actions in the wiring pass".
- `Update Timeout Rules` / `Update Fee Structure` also toast "Saved locally (wiring pass pending)".

## Files touched

- **New**: `src/pages/AdminSettings.tsx` (single file, sections split into small local components in the same file for readability).
- **Edit**: `src/App.tsx` — add `<Route path="/admin/settings" element={<AdminSettings />} />`.
- **Edit**: `src/components/admin/useAdminNav.ts` — add `/admin/settings` to `BUILT_ROUTES`.
- **Edit** (small): `src/components/admin/AdminSidebar.tsx` — verify the "Platform Settings" entry label/icon matches the reference ("Settings" with gear); adjust label if needed.

## Explicitly out of scope for this pass

- No new tables, no edge functions, no migration.
- No `get_effective_setting` RPC, no vendor-scope switching, no audit-log writes.
- No data fetch — page renders with the exact default values shown in the HTML/screenshot.

Once you approve and I ship this UI, the follow-up wiring pass (already-drafted multi-tenant plan) plugs it into `system_settings` + `timeout_rules` + audit trail.
