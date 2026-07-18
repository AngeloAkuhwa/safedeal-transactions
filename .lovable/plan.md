
## Goal

Rework `src/pages/AdminNotifications.tsx` so every section — header, KPI cards, filters, failed-deliveries table, delivery performance, broadcast composer, and recent activity — matches the provided HTML **section-for-section**: same headings, subheadings, labels, button copy, icon meanings, column set, badge shapes, layout ratio, and internal card structure. Data wiring (edge functions, react-query, retry/broadcast mutations, CSV export) stays exactly as it is today.

Only the presentation layer changes. No backend, service, or route changes.

---

## Section-by-section corrections

### 1. Header (`HeaderBar`)
- Title stays `Notification Center`.
- Subtitle changes to: **"Monitor delivery performance and manage communication issues"**.
- Right of title show two chips (not inside the subtitle):
  - Green `● Live` pulse chip (already correct).
  - New slate chip `🕒 Last sync: {relative}` (hidden on <lg).
- Action buttons: `Export Report` (outline slate) and `Broadcast Message` (blue). Icons: `Download`, `Megaphone`. Copy exact.

### 2. KPI Cards (`KpiCards`) — full redesign of card internals
Reference layout is **icon top-left + trend top-right + title + big colored number**, not the current compact tile.

Each card:
```
[icon box]                        [trend %]
                                  [vs yesterday]
Title (white, text-lg, semibold)
Big number (text-3xl, bold, color-matched)
```
Six cards, colors and copy exact:
| Card | Icon | Color | Trend text |
|---|---|---|---|
| Sent Today | `Send` (paper-plane) | emerald | `+18% vs yesterday` |
| Failed Deliveries | `AlertTriangle` | red | `+5% vs yesterday` |
| SMS Failures | `Smartphone` | orange | `+12% vs yesterday` |
| Email Failures | `Mail` | purple | `+8% vs yesterday` |
| In-App Rate | `Bell` | blue | `98.7% delivery rate` |
| Retry Queue | `RotateCw` | amber | `-23% vs yesterday` |

Trend values come from backend if present (`kpis.*_trend`); otherwise render the reference strings so the visual matches. Grid: `sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6`.

### 3. Search & Filters (`FiltersBar`)
- Card gets a **header row with border-b**: title `Search & Filter Notifications` (magnifying-glass blue icon) + subtitle **"Search by user, notification ID, or transaction reference"**.
- Inputs render **with visible labels above them** (`Search Query`, `Channel`, `Status`, `Type`) — matches HTML.
- Search placeholder: `User email, notification ID, TXN-xxx...`.
- Add Status option `Retrying`.
- Bottom action row (replaces the current toggle) with three buttons:
  - `Search Notifications` (blue, primary — triggers refetch)
  - `Clear Filters` (slate)
  - `Failed Only` (amber, toggles `failedOnly`; shows active state)

### 4. Failed Deliveries & Retry Queue (`FailedTable`)
- Card header gets subtitle **"Notifications requiring attention or manual retry"** and two right-aligned buttons: `Retry All Failed` (amber, retries all retriable rows via existing mutation looped) and `Export Log` (slate — CSV of failed rows only).
- Column set changes to match reference: **User | Channel | Type | Failure Reason | Retry Status | Timestamp | Quick Actions**. Drop the current "Notification" column; merge title context into failure/type cells.
- Channel cell: colored channel icon + label (no pill).
- Type cell: colored pill (`Payment` blue, `Dispute` red, `Security` amber, `System` slate, `Verification` purple) derived from `r.type`.
- Failure Reason cell: red circle-exclamation icon + `provider_response` main line + small muted secondary line (`Provider error code: …` when available, else empty).
- Retry Status cell: amber pill `Attempt N/3` while retriable; red pill with X icon `Failed 3/3` when exhausted.
- Quick Actions cell: colored **button pills with label text** (not icon-only ghost buttons):
  - Purple `User`
  - Blue `DIS-XXXX` (only when dispute linked)
  - Emerald `TXN-XXXX` (only when transaction linked)
  - Amber `Retry`
  - Slate `Details` (opens a read-only info modal — new lightweight `Dialog`, no backend)

### 5. Delivery Performance (`DeliveryPerf`) — restructure to reference
- Card gets header with border-b: title `Delivery Performance` + subtitle **"Last 24 hours breakdown by channel"**.
- Each row becomes a full block: icon tile + channel name + descriptor line, then large colored count on the right + delivered % (color = green ≥95, orange 90–95, red <90), then a full-width progress bar of the channel's color.
- Descriptors: In-App → "Real-time platform notifications"; Email → "Transaction confirmations & alerts"; SMS → "Security codes & urgent alerts"; Push → "Mobile push alerts".
- Layout: this card now spans **xl:col-span-2** (wider), and Broadcast becomes the narrow right column — matches HTML grid.

### 6. Broadcast Message (`BroadcastComposer`)
- Header row with border-b: `📢 Broadcast Message` (amber bullhorn) + subtitle **"Send system-wide announcements with caution"**.
- Amber warning block copy: **"Broadcast Caution — Messages will be sent to all selected users immediately. Review content carefully before sending. This action cannot be undone."** (Replaces the current opt-out info line; opt-out behavior stays server-side and unchanged.)
- Field labels & copy exact: `Message Title *`, helper `Keep it clear and actionable (max 60 characters)`; `Message Body` with placeholder `We will be performing scheduled maintenance...`; `Priority Level` options `Low / Medium / High / Critical Alert` (mapped to existing enum `low/normal/high/urgent`); `Target Audience` options `All Users / Active Transactions Only / Verified Users / Premium Members` (mapped to existing `all/buyers/sellers/verified` — "Active Transactions" → buyers, "Premium" → verified, with a small helper note preserved).
- Delivery Channels: vertical stacked checkboxes (In-App, Email, SMS) — matches HTML.
- Submit button: **amber** `Send Broadcast` with paper-plane icon (not blue).
- Composer is **always visible** in the right column (not toggled by header button). Header `Broadcast Message` button now scrolls to composer + focuses the title field.

### 7. Recent Notification Activity (`RecentActivity`)
- Card header: title + subtitle **"Real-time delivery log with status tracking"**, with right-aligned `Refresh` (calls `refetch`) and `Filter` (scrolls to filters bar) buttons.
- Columns reordered to match reference: **Timestamp | User | Type | Channel | Message | Status | Actions**.
- User cell: avatar + email + `ID: USR-xxxx` muted (derived from `user.id` short).
- Type cell: colored pill as in failed table.
- Channel cell: colored channel icon + label.
- Message cell: `notification.title` (truncated, max-w-xs).
- Status pill uses reference labels: `Delivered` (check), `Failed` (x-circle), `Pending` (clock), `Retrying` (rotate).
- Actions cell: eye icon button (opens the same Details modal used in failed table).

### 8. Global visual tokens
- Continue using semantic tokens (`bg-card`, `border-border`, `text-foreground`, etc.) — do **not** hardcode `bg-slate-900`. The admin theme already maps to the slate palette so the visual result matches the reference.
- Card headers gain the `border-b border-border` divider pattern where the HTML has one, so every section has the consistent "title-row + body" shape shown in the reference.

---

## Files touched

- `src/pages/AdminNotifications.tsx` — restructure all seven sub-components as above. Extract `TypePill`, `ChannelCell`, and a small `DetailsDialog` inside the same file to keep the change contained.

No changes to:
- `src/services/admin-notifications.service.ts`
- `supabase/functions/admin-notifications/*`
- `supabase/functions/admin-notifications-action/*`
- Routing, sidebar, or `AdminLayout`.

## Out of scope

- Real trend calculations (uses backend value when present, reference fallback otherwise).
- New audience segments beyond current enum (label-only remap).
- Details modal is client-only (no new endpoint).
