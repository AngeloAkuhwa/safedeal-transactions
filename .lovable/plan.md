## Goal
Make the `Payout Records` table in `src/components/admin/payouts/PayoutsTable.tsx` visually match the reference (`Payout_Management-16.html` + screenshots 3 & 4) end-to-end. Skeleton (9 columns, `p-4` cells, hidden horizontal scrollbar, `min-w-[1200px]`) is already correct — only cell content and the Actions cell need to change.

## Changes

### 1. Actions cell — per-status layout (biggest visible gap)
Reference shows DIFFERENT button combinations per status. Current build always shows `View + Details + ⋮`.

Update the actions `<td>` to render based on row status:

- **Failed** (`status === "failed"` and `retry_allowed`):
  `[Retry] [Details] [⋮]` — emerald Retry + slate Details + ellipsis
- **Pending / Processing**:
  `[View] [⋮]` — slate View button only, no Details
- **Completed**:
  `[icon-only eye button] [⋮]` — 8×8 slate square with just the eye icon (no "Details" text), then ellipsis
- **Awaiting release** (eligible or not):
  `[Release] [Details] [⋮]` — keep existing behavior
- **Blocked / on_hold / reversed / cancelled (default)**:
  `[Unblock or View] [Details] [⋮]` — keep existing

Implementation: replace the current static `primaryCTA(...) + always-on Details button + ⋮` block with a small `renderActions(r)` switch returning JSX for each status. Reuse `emeraldBtn` / `slateBtn` constants. The icon-only completed button uses the same `w-8 h-8 bg-slate-800 hover:bg-slate-700 rounded-lg` styling as the `⋮` trigger.

### 2. Payout ID — friendly format
Reference shows `PAY-2024-001234`. Current shows raw UUID `f1000001-0005-…`.
Render a friendly short code derived from `r.entered_queue_at` year + last 6 chars of `r.id` (uppercase, hex): `PAY-{year}-{last6}`. Keep the Tooltip showing the full UUID for admin lookup.

### 3. Seller subtitle — tier label, not email
Reference shows `Premium Seller` / `Verified Seller` under seller name. Current shows `seller@samplestore.test`.
Render `r.seller.tier_label` if present in the row type; otherwise derive a fallback string `"Seller"` (no email). If `tier_label` isn't on `PayoutRow`, add a non-breaking optional field read with `(r.seller as any).tier_label ?? (r.seller.is_verified ? "Verified Seller" : "Seller")` — purely a presentation tweak, no service change.

### 4. Transaction subtitle — keep item title
Reference uses category-style text ("Digital Marketing") but our real data carries `item_title` ("Touch Light Phone"), which is the equivalent contextual subtitle. Keep current behavior; no change needed.

### 5. Payout Account
Already matches reference structure (Bank name + VERIFIED/INVALID pill + masked account, or red "No verified payout account" fallback). No change.

## Out of scope
- Table skeleton, columns, status pill, hidden horizontal scrollbar, pagination, header.
- Dropdown menu items (already status-aware from previous turn).
- Backend service changes — purely a presentation update in `PayoutsTable.tsx`.

## Files touched
- `src/components/admin/payouts/PayoutsTable.tsx` (only)
- `.lovable/plan.md` (updated to reflect this turn)
