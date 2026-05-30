# Case Communication — Align Exactly to Uploaded HTML

The HTML at `Dispute_Details_2-8.html` lines 533–901 is the source of truth. Every value below is taken verbatim from it. We rebuild the section inside `src/pages/AdminDisputeDetail.tsx`, replacing the current `CardHeader + CommunicationStatusRow + CommunicationTabs` block. No other section is touched. No new files, no backend work.

---

## 1. Section wrapper & container

Replace the current outer `<Card>` for Case Communication with a plain wrapper:

- Outer section: `p-8` (matches the HTML `<div class="p-8">`).
- Inner container: `bg-slate-900 border border-slate-800 rounded-xl overflow-hidden`.
- Remove `rounded-2xl`, shadows, gradient layers, or any extra wrapper.

## 2. Section header (inside container)

`<div class="p-6 border-b border-slate-800">`
- `<h3 class="text-white text-lg font-semibold">Case Communication</h3>`
- `<p class="text-slate-400 text-sm mt-1">Structured dispute communication workspace - all messages are logged and auditable</p>` (note hyphen, not em-dash).

No `text-2xl`, no `font-bold`, no icon.

## 3. Communication Status row

`<div class="px-6 py-4 bg-slate-800/30 border-b border-slate-800">`

Label row: `flex items-center gap-2 mb-3`
- `fa-circle-info` blue (use Lucide `Info` with `text-blue-400`).
- Label: `Communication Status`, classes `text-slate-300 text-xs font-semibold uppercase tracking-wider`.

Chips wrapper: `flex flex-wrap gap-2`. Render all 5 chips in this exact order; each `flex items-center gap-2 px-3 py-1.5 rounded-lg border`:

| # | Label | Meta | Bg / Border / Text | Leading element |
|---|---|---|---|---|
| 1 | Buyer Responded | date (e.g. `Jan 19`) | `bg-emerald-500/10 border-emerald-500/30 text-emerald-400` | `w-2 h-2 bg-emerald-400 rounded-full` dot |
| 2 | Seller Response Overdue | `Nd` overdue | `bg-red-500/10 border-red-500/30 text-red-400` | red dot with `animate-pulse` |
| 3 | Evidence Requested | date | `bg-orange-500/10 border-orange-500/30 text-orange-400` | Lucide `FilePlus2` |
| 4 | Reminder Sent | date | `bg-yellow-500/10 border-yellow-500/30 text-yellow-400` | Lucide `Bell` |
| 5 | Deadline Notice Sent | date | `bg-red-500/10 border-red-500/30 text-red-400` | Lucide `Clock` |

Meta text uses the chip color at `/60` opacity, `text-xs`. Labels are `text-xs font-medium`. Render all 5 always, in this order, derived from existing dispute fields where possible (response due, reminders) — no dashed unknown chips.

## 4. Tabs

`<div class="border-b border-slate-800"><div class="flex gap-1 px-6">…</div></div>`

Three buttons, each `px-4 py-3 text-sm font-medium transition-all`:
- Buyer Messages — icon `User` `text-blue-400 mr-2`.
- Seller Messages — icon `Store` `text-orange-400 mr-2`.
- Internal Notes — icon `StickyNote` `text-purple-400 mr-2`.

Inactive: `text-slate-400 hover:text-white hover:bg-slate-800/50`.

Active: `text-white bg-slate-800 border-b-2` with bottom border in the tab's accent — `border-blue-500` (buyer), `border-orange-500` (seller), `border-purple-500` (internal). Default active tab = Seller Messages (matches HTML).

No pill, no rounded background.

## 5. Tab content area

`<div class="p-6">` containing, in order:
1. Message thread
2. Quick Actions row
3. Message Composer

### 5a. Message thread

`<div class="space-y-4 mb-6 max-h-[600px] overflow-y-auto pr-2">`

This is the ONLY scroll container in the section. Fixes the page bug where outer page content scrolled underneath the tabs — by giving the thread its own `max-h` + `overflow-y-auto`, the outer page scroll stops inheriting it. No `sticky` on header/tabs/composer in this pass.

### 5b. MessageItem (each card)

Base: `border-l-4 rounded-lg p-4` with type-keyed colors:

| Type | Border-left | Background | Body box |
|---|---|---|---|
| Deadline Notice | `border-red-500` | `bg-slate-800/50` | `bg-slate-900/50` |
| Reminder | `border-yellow-500` | `bg-slate-800/50` | `bg-slate-900/50` |
| Seller Response (General Reply) | `border-orange-500` | `bg-orange-500/5` | `bg-slate-900/70 border border-orange-500/10` |
| Evidence Request | `border-slate-500` | `bg-slate-800/50` | `bg-slate-900/50` |
| Initial Contact / General | `border-slate-500` | `bg-slate-800/50` | `bg-slate-900/50` |
| Internal Note | `border-purple-500` | `bg-slate-800/50` | `bg-slate-900/50` |

Header row (`flex items-start justify-between mb-3`):
- Left (`flex items-start gap-3`):
  - Avatar `w-9 h-9 rounded-full ring-2 ring-slate-700` (or `ring-orange-500/30` for seller-authored).
  - Identity line (`flex items-center gap-2 mb-1`):
    - Sender name — color by role: agent/admin = `text-white font-semibold`, seller = `text-orange-400 font-semibold`, buyer = `text-blue-400 font-semibold`.
    - Lucide `ArrowRight` `text-slate-600 text-xs`.
    - Recipient name — agent recipient `text-white font-medium`, seller recipient `text-orange-400 font-medium`, buyer recipient `text-blue-400 font-medium`.
    - Role pill: `px-2 py-0.5 text-xs rounded` — neutral `bg-slate-700 text-slate-400` for Agent→Seller / Agent→Buyer, `bg-orange-500/20 text-orange-400` for Seller→Agent, `bg-blue-500/20 text-blue-400` for Buyer→Agent, `bg-purple-500/20 text-purple-400` for Agent→Internal.
  - Sub-line: `text-slate-400 text-xs` — `{timestamp} • {topic}`.
- Right (`flex flex-col items-end gap-1`):
  - Type badge `px-2 py-1 text-xs font-semibold rounded flex items-center gap-1` in type tone (`bg-red-500/20 text-red-400`, `bg-yellow-500/20 text-yellow-400`, `bg-orange-500/20 text-orange-400`, `bg-slate-700 text-slate-300`, `bg-purple-500/20 text-purple-400`) with the matching icon (`AlertTriangle`, `Bell`, `MessageCircle`, `FilePlus2`, `StickyNote`).
  - `#MSG-{nnn}` in `text-slate-500 text-xs`.

Body: `bg-{variant} rounded-lg p-3 mb-3` then `<p class="text-slate-300 text-sm leading-relaxed">…</p>`. Optional inline `<strong>` accent uses the type color (red/yellow/orange) before the message text.

Attachments (optional, only when present): row above the footer divider — `flex gap-2 mb-3`, each chip `bg-slate-800 border border-slate-700 rounded-lg p-2 flex items-center gap-2 text-xs hover:border-orange-500 transition-all cursor-pointer` with `Paperclip` icon in the variant color, file name `text-slate-300`, size `text-slate-500`.

Footer (`flex items-center justify-between pt-2 border-t border-slate-700`):
- Left meta (`flex items-center gap-3 text-xs`): Read-state chip — `Read by seller/agent` (`text-emerald-400` with `CheckCheck`) or `Sent via email` (`text-slate-500` with `Check`) — plus optional secondary like `store****@music.com` (`Mail`) or `Opened: {time}` (`Clock`) in `text-slate-600`.
- Right (`flex items-center gap-2`): `Reply` button (`text-slate-500 hover:text-blue-400 text-xs` with `Reply` icon, text "Reply") and ellipsis button (`MoreHorizontal` `text-slate-500 hover:text-slate-300 text-xs`). Both visual-only in this pass.

### 5c. Tab data mapping
- Seller Messages tab: show all existing admin↔seller dispute communications, ordered newest first. If no records exist, render the same `MessageItem` shell empty? No — keep the existing 5-message seed mapped from real data where available; if no messages, render a plain `text-slate-400 text-sm` placeholder line `No seller messages yet.` inside the thread (no card). No invented empty state component.
- Buyer Messages tab: same shape, sourced from buyer↔admin communications. Placeholder line when empty.
- Internal Notes tab: map existing `dispute_internal_notes` → `MessageItem` with `type=internal`, sender = note author name, recipient = `Internal`, role pill `Agent → Internal`, body = note text, timestamp = `created_at`, no attachments, footer meta = `Visible to admins only` (`Lock` icon, `text-slate-500`).

## 6. Quick Actions row

`<div class="mb-4 pb-4 border-b border-slate-800">` placed AFTER the thread, BEFORE composer.

- Label: `Quick Actions` — `text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3`.
- Buttons wrapper: `flex flex-wrap gap-2`.
- 4 buttons, each `px-3 py-1.5 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-all`:
  1. `CircleHelp` + `Request Clarification` — hover `hover:border-orange-500 hover:text-orange-400`.
  2. `FilePlus2` + `Request Evidence` — hover orange.
  3. `Bell` + `Send Reminder` — hover `hover:border-yellow-500 hover:text-yellow-400`.
  4. `Clock` + `Send Deadline Notice` — hover `hover:border-red-500 hover:text-red-400`.

Visual-only; wire onClick to existing handlers if they exist, otherwise no-op.

## 7. Message Composer

`<div class="bg-slate-800/30 border border-slate-700 rounded-lg p-4">`

- Label: `New Message to Seller` — classes per HTML (`mb-2 block` etc.). Label text follows active tab:
  - Seller tab → `New Message to Seller`, placeholder `Type your message to {sellerName}...`, send button `bg-orange-500 hover:bg-orange-600`, label `Send to Seller`.
  - Buyer tab → `New Message to Buyer`, placeholder `Type your message to {buyerName}...`, send button `bg-blue-500 hover:bg-blue-600`, label `Send to Buyer`.
  - Internal tab → `New Internal Note`, placeholder `Write an internal note...`, send button `bg-purple-500 hover:bg-purple-600`, label `Save Note`.
- Textarea: `w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-slate-300 text-sm placeholder-slate-500 focus:border-orange-500 focus:outline-none resize-none` rows=4. Focus border color matches the tab accent.
- Footer row: `flex items-center justify-between`.
  - Left (`flex items-center gap-2`):
    - Attach File button — `px-3 py-2 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-xs font-medium` with `Paperclip` icon, hover matches accent.
    - Message-type `<select>` — same chrome — options: `General Reply`, `Clarification Request`, `Evidence Request`, `Reminder`, `Deadline Notice`, `Resolution Update`.
  - Right: Send button `px-5 py-2 text-white rounded-lg text-sm font-medium` with `Send` (paper-plane) icon. On Internal tab, route to existing `onAddNote`; on Buyer/Seller tabs, no-op for now (no backend in scope).

## 8. Scroll-bleed fix

Root cause of the reported "page content scrolling under tabs" is the section having no internal scroll boundary, so the long thread pushed page height while sibling sections rendered behind. Resolution:
- Outer section keeps normal document flow (no `sticky`, no `position: fixed`).
- The thread container (`max-h-[600px] overflow-y-auto`) becomes the ONLY scroll area. Header/status/tabs/quick-actions/composer remain in normal flow above/below it, so nothing visually slides under them.

Explicitly out-of-scope per user: no sticky tabs, no sticky composer, no custom mobile sheet.

## 9. Responsive (only what's already in the HTML)

The HTML uses the same classes at all widths; no custom mobile/tablet rules. We keep that:
- Chips already `flex-wrap` → wrap naturally on narrow widths.
- Tabs row keeps `flex gap-1 px-6` with horizontal overflow allowed (`overflow-x-auto` on the tabs wrapper) so 3 tabs never stack — this is the only addition for small screens to prevent overlap, no visual restyle.
- Message header `flex-wrap` for the identity row so role pill drops to a new line on narrow widths without breaking layout.
- Composer footer keeps `flex items-center justify-between`; on narrow widths the left controls wrap (`flex-wrap gap-2`) — same chrome, no alternate layout.

No new breakpoints, no alternate components.

## 10. Files

- Edit only: `src/pages/AdminDisputeDetail.tsx`.
  - Replace existing `CommunicationStatusRow`, `CommunicationTabs`, `MessageItem`, `CommEmpty`, composer, and quick-actions blocks with the structure above.
  - Remove the `CardHeader` wrapper for this section and use the raw `bg-slate-900 border border-slate-800 rounded-xl overflow-hidden` container instead.
- No new components, no new services, no schema changes, no edge functions, no test changes.

## 11. Acceptance checklist

- Container is `bg-slate-900 border-slate-800 rounded-xl`, no `rounded-2xl` or extra shadow.
- Title `text-lg font-semibold`, subtitle exact wording with hyphen.
- Status row has all 5 chips, `rounded-lg`, exact colors, correct order, correct icons/dots, meta text in `/60` tone.
- Tabs are underline-style; Seller default-active with `bg-slate-800 border-b-2 border-orange-500`; icon colors match.
- Message cards: left-border + bg by type, avatar 36px ringed, sender→recipient identity line with role pill, type badge + `#MSG-###`, body box, attachments row when present, footer with read meta + Reply/ellipsis.
- Quick Actions row exactly 4 chips, `px-3 py-1.5`, correct hover colors.
- Composer matches HTML chrome; label/placeholder/send button color swap by active tab.
- Only the thread scrolls; outer page scroll no longer bleeds under tabs.
- No sticky behavior, no invented empty-state component, no `rounded-full` chips, no enlarged typography.
