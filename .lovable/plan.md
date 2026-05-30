# Match AdminDisputeDetail top sections to design

Scope: only the visible top sections in `src/pages/AdminDisputeDetail.tsx`. No backend, schema, sidebar, layout, or below-the-fold changes.

## 1. Avatar — fix broken/clipped image (root cause of both card avatars rendering broken)

Update local `Avatar` (lines 85–93) so a failed `src` falls back to initials instead of showing the browser's broken-image glyph.

- Add `useState` `failed` flag; render initials circle if `!src || failed`.
- On the `<img>`, add `onError={() => setFailed(true)}`, `loading="lazy"`, `referrerPolicy="no-referrer"`.
- Keep `rounded-full object-cover shrink-0` with explicit `width`/`height` from `size`.

This single fix resolves the broken avatar in both Buyer and Seller cards and the small Sarah Chen avatar in the summary strip.

## 2. Sticky header (lines 411–455)

Match design rhythm. Keep current sticky/backdrop wrapper, adjust internals:

- Container padding: `px-6 py-4 lg:px-8` → `px-6 py-3.5 lg:px-8 lg:py-4` (slightly tighter, matches design height).
- Back arrow button: drop the bordered box look (which doesn't appear in the design). Change to plain ghost: `rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-muted` (remove `border border-border bg-background`).
- Title: `text-lg font-bold` → `text-xl font-bold tracking-tight`.
- Subtitle: keep `text-xs text-muted-foreground truncate`; render as `{itemTitle} - {txCode}` (hyphen instead of middle-dot to match design).
- Right cluster: leave overdue pill (already red with dot) and Print button. Remove the green "Within SLA" pill entirely from this header (design only shows overdue/print on the right).
- Bottom border already present via `border-b border-border` — keep.

## 3. Summary strip (lines 463–505)

Restructure each column to a stacked two-pair layout matching design (label/value, label/value), with consistent vertical rhythm:

- Wrapper: `bg-card border-b border-border`, inner grid `grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-5 px-6 py-6 lg:px-8`.
- Each column is `flex flex-col gap-4` with two `KV`-style pairs (label `text-[11px] uppercase tracking-wide text-muted-foreground`, value `text-sm font-semibold text-foreground` — bump value weight to semibold to match design).

Columns:
1. Dispute ID → `#{disputeCode}` (mono) / Transaction → `{txCode}` rendered as blue link button (`text-blue-400 hover:text-blue-300 font-semibold`), no external-link icon (design has none).
2. Amount in Dispute → `{ngn(amountInDispute)}` / Dispute Reason → reason in `text-orange-400 font-semibold`.
3. Created → `fmtDate(opened_at)` / Last Activity → absolute date via `fmtDate(tx.updatedAt)` (design shows a date, not "2 days ago" relative text).
4. Status → `<StatusPill>` / Assigned Agent → avatar + name (or "Unassigned").

Remove the current asymmetric layout in column 4 (`flex flex-col gap-2 min-w-0`) so it follows the same `gap-4` rhythm as the others.

## 4. Buyer & Seller cards (`PartyCard`, lines 825–928)

Keep current `Card` shell, tweak details to match design one-to-one:

- Role chip (action slot): make it slightly larger `px-2 py-0.5 text-[10px]` → `px-2.5 py-1 text-[11px]`, keep blue for buyer / orange for seller.
- Body padding stays `p-6 space-y-5`.
- Identity row: avatar bumped to `size={48}` (already 48). Replace local `Avatar` use with fixed-fail behaviour from §1. Name `text-base font-semibold`. Sub: `User ID: USR-…` (drop the `font-mono` to match design; keep `text-xs text-muted-foreground`). Right side: only render one signal — `Verified` (emerald CheckCircle2) for buyer; for seller render `Gold Seller` style with `Star` icon in `text-yellow-400` when `sellerTier` exists, else verified. Import `Star` from lucide and use it instead of `Flag`.
- Details grid: stays `grid grid-cols-2 gap-4 text-sm`. Values: drop `font-mono text-xs` on email/phone so they match design typography (`text-sm text-foreground`). For seller, `Payout Status` value: only show red "Blocked" when payout is actually blocked — fall back to `titleCase(payoutStatus)`/"—" otherwise (no hard-coded red Blocked).
- First button row (`grid grid-cols-[1fr_1fr_auto] gap-2`):
  - Primary `Call`: keep blue for buyer, orange for seller; size `sm`, `h-9` to match design proportions.
  - `Email`: neutral outline button.
  - Square profile button: `variant="outline" size="sm" className="h-9 w-9 p-0"`.
- Add a thin divider before the second button row: wrap the second `grid grid-cols-3 gap-2` in a `<div className="pt-4 border-t border-border"><div className="grid grid-cols-3 gap-2">…</div></div>`.
- Second row buttons keep current icons (UserIcon, Scale, Receipt) and labels (View Profile, Dispute History, Transactions). Size `sm`, equal width.

Buyer and seller cards already sit in `grid grid-cols-1 lg:grid-cols-2 gap-6` — leave untouched; equal height comes naturally from `Card` + identical internal structure.

## Out of scope

Financial Overview, Locked Agreement, Buyer Claim, Seller Response, Case Communication, Timeline, Resolution sidebar, AdminLayout, AdminDisputes list page, any service / SQL / RLS / route changes.

## Verification

- Reload `/admin/disputes/:id` at ≥1280px. Header height, back arrow weight, title/subtitle rhythm match design.
- Summary strip: 4 columns, two label/value pairs each, semibold values, blue TXN link, orange reason, red Escalated pill, Sarah Chen avatar renders (or initials if URL fails).
- Buyer/seller avatars render as full circles (initials fallback if `avatarUrl` 404s — confirmed by temporarily setting a bad URL).
- Buyer Call is blue, Seller Call is orange. Both card heights line up. Bottom row has thin top divider.
- Sections below cards untouched (diff confined to lines ~411–928).
