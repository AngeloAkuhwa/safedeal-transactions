# Case Communication — Rebuild to Match Uploaded HTML Exactly

Scope: only the Case Communication section inside `src/pages/AdminDisputeDetail.tsx`. No other section, no backend, no schema change.

## 1. Container & header
- Replace the current `<Card>` wrapper with: `bg-slate-900 border border-slate-800 rounded-xl overflow-hidden` (no `rounded-2xl`, no shadow, no gradient).
- Header block: `p-6 border-b border-slate-800`.
  - Title `h3`: `text-white text-lg font-semibold` → "Case Communication".
  - Subtitle `p`: `text-slate-400 text-sm mt-1` → "Structured dispute communication workspace - all messages are logged and auditable" (hyphen, not em-dash).

## 2. Communication Status row
`px-6 py-4 bg-slate-800/30 border-b border-slate-800`.
- Label row: `Info` icon `text-blue-400` + "COMMUNICATION STATUS" (`text-slate-300 text-xs font-semibold uppercase tracking-wider`).
- 5 chips, fixed order, `flex flex-wrap gap-2`, each `flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium` with meta in same color at `/60`:
  1. **Buyer Responded** — emerald (`bg-emerald-500/10 border-emerald-500/30 text-emerald-400`), green dot.
  2. **Seller Response Overdue** — red, red dot `animate-pulse`, meta "Nd overdue".
  3. **Evidence Requested** — orange, `FilePlus2` icon.
  4. **Reminder Sent** — yellow, `Bell` icon.
  5. **Deadline Notice Sent** — red, `Clock` icon.

## 3. Tabs (underline style)
`border-b border-slate-800` wrapper; inner `flex gap-1 px-6 overflow-x-auto`.
- Three buttons `px-4 py-3 text-sm font-medium`:
  - Buyer Messages — `User` icon `text-blue-400`.
  - Seller Messages — `Store` icon `text-orange-400` (DEFAULT ACTIVE).
  - Internal Notes — `StickyNote` icon `text-purple-400`.
- Inactive: `text-slate-400 hover:text-white hover:bg-slate-800/50`.
- Active: `text-white bg-slate-800 border-b-2` with accent border (`border-blue-500` / `border-orange-500` / `border-purple-500`).

## 4. Tab content area (`p-6`)
Order: message thread → Quick Actions → Composer.

### 4a. Thread
`space-y-4 mb-6 max-h-[600px] overflow-y-auto pr-2` — the ONLY scroll container (fixes the previously reported scroll-bleed).

### 4b. MessageItem card
Base: `border-l-4 rounded-lg p-4`, type-keyed:
| Type | Border-l | Bg | Body box |
|---|---|---|---|
| Deadline Notice | red-500 | slate-800/50 | slate-900/50 |
| Reminder | yellow-500 | slate-800/50 | slate-900/50 |
| Seller Response (General Reply) | orange-500 | orange-500/5 | slate-900/70 + orange-500/10 border |
| Evidence Request | slate-500 | slate-800/50 | slate-900/50 |
| Initial Contact / Resolution Update | slate-500 | slate-800/50 | slate-900/50 |
| Internal Note | purple-500 | slate-800/50 | slate-900/50 |

Header (`flex items-start justify-between mb-3`, allow `flex-wrap` on identity row):
- Avatar `w-9 h-9 rounded-full ring-2 ring-slate-700` (orange ring for seller-authored).
- Identity: sender (role-colored) → `ArrowRight` text-slate-600 → recipient (role-colored) → role pill (`px-2 py-0.5 text-xs rounded`, tone by direction).
- Sub-line: `{timestamp} • {topic}` in `text-slate-400 text-xs`.
- Right column: type badge with icon (`AlertTriangle/Bell/MessageCircle/FilePlus2/StickyNote`) in tone, then `#MSG-{nnn}` in `text-slate-500 text-xs`.

Body box: `rounded-lg p-3 mb-3`, `text-slate-300 text-sm leading-relaxed`. For Deadline Notice and Reminder, leading `<strong>` colored (red-400 / yellow-400) before the text.

Attachments (only when present): `flex gap-2 mb-3`, chips `bg-slate-800 border border-slate-700 rounded-lg p-2 flex items-center gap-2 text-xs hover:border-orange-500` with `Paperclip` + name + size.

Footer (`flex items-center justify-between pt-2 border-t border-slate-700`):
- Left meta `text-xs`: read state (`CheckCheck` emerald for read, `Check` slate for sent) + optional masked email (`Mail`) / opened time (`Clock`).
- Right: `Reply` button (`text-slate-500 hover:text-blue-400`) + `MoreHorizontal`. Both visual-only.

## 5. Quick Actions
`mb-4 pb-4 border-b border-slate-800`. Label "QUICK ACTIONS" (`text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3`). Wrapper `flex flex-wrap gap-2`. Four chips `px-3 py-1.5 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-xs font-medium`:
1. `HelpCircle` + Request Clarification — hover orange.
2. `FilePlus2` + Request Evidence — hover orange.
3. `Bell` + Send Reminder — hover yellow.
4. `Clock` + Send Deadline Notice — hover red.

## 6. Composer
`bg-slate-800/30 border border-slate-700 rounded-lg p-4`.
- Label/placeholder/send button swap per active tab:
  - Seller (default): "NEW MESSAGE TO SELLER" / "Type your message to {sellerName}..." / orange `Send to Seller`.
  - Buyer: "NEW MESSAGE TO BUYER" / blue `Send to Buyer`.
  - Internal: "NEW INTERNAL NOTE" / purple `Save Note` → wired to existing `onAddNote`.
- Textarea: `w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-slate-300 text-sm placeholder-slate-500 focus:outline-none resize-none` rows=4, focus border in tab accent.
- Footer row `flex items-center justify-between flex-wrap gap-2`:
  - Left: Attach File button (`Paperclip`) + message-type `<select>` (General Reply / Clarification Request / Evidence Request / Reminder / Deadline Notice / Resolution Update), same chrome.
  - Right: Send button `px-5 py-2 text-white rounded-lg text-sm font-medium` with `Send` icon.

## 7. Data mapping (buyer/seller messages)
Codebase check confirms: **no `dispute_messages` table exists** — only `dispute_internal_notes`. So:
- **Internal Notes tab**: map existing `dispute_internal_notes` → MessageItem (`type=internal`, sender=note author, recipient="Internal", role pill "Agent → Internal", footer "Visible to admins only" with `Lock`).
- **Seller Messages tab**: seed with the 5 messages from the HTML reference (Deadline Notice #147, Reminder #142, Seller Response #138 with attachments, Evidence Request #134, Initial Contact #130), parameterized with real seller/agent names from the dispute payload. This matches the design's demo state without inventing backend.
- **Buyer Messages tab**: render an empty-state line `text-slate-400 text-sm` → "No buyer messages yet." (no invented cards). When real records eventually land we map the same shape.

No new service, no schema change, no edge function.

## 8. Scroll behaviour
- Outer section stays in normal flow (no sticky / fixed).
- Only the thread (`max-h-[600px] overflow-y-auto`) scrolls internally → fixes message-under-tabs bleed.

## 9. Responsive
- Tabs row: `overflow-x-auto` so 3 tabs never wrap/stack.
- Status chips: `flex-wrap` (native).
- Message header identity row: `flex-wrap` so role pill drops to next line cleanly on narrow widths; right column (badge + #MSG) stacks under header on mobile via `flex-wrap` on the header container.
- Composer footer: `flex-wrap gap-2`; on mobile Send button fills via `w-full sm:w-auto`.
- No new breakpoints, no alternate components — same chrome at all widths.

## 10. Out of scope
Sidebar, header strip, summary, buyer/seller info cards, financial overview, locked agreement, buyer claim, seller response, right resolution sidebar, case timeline — all untouched.

## Files
- Edit only: `src/pages/AdminDisputeDetail.tsx` (replace existing communication block + helpers).

## Acceptance
- Container `bg-slate-900 border-slate-800 rounded-xl`, no extras.
- Title/subtitle exact strings and sizes.
- Status row: 5 chips, exact order/colors/icons, `rounded-lg`, meta in `/60` tone.
- Tabs underline-style, Seller default-active with orange bottom border + `bg-slate-800`.
- Message cards: left-border + bg by type, 36px ringed avatar, sender→recipient with role pill, type badge + `#MSG-###`, body box, attachment chips when present, footer with read meta + Reply/ellipsis.
- Quick Actions: 4 chips, accent-on-hover.
- Composer label / placeholder / send color swap per tab; Internal Note saves via existing handler.
- Only the thread scrolls; outer page scroll stays clean.
- Buyer tab shows empty-state line; Seller tab populated with HTML-matching seed; Internal tab wired to real `dispute_internal_notes`.
- No horizontal overflow on desktop, tablet, mobile.
