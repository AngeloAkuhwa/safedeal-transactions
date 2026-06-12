## Goal
Update the `…` (ellipsis) row action menu in `src/components/admin/payouts/PayoutsTable.tsx` so it matches the reference design's status-specific menu items exactly. The table itself (columns, layout, pagination, primary CTA buttons) already matches and is out of scope.

## Status-specific menu items

**Failed row** (e.g. PAY-2024-001234):
- View Failure Details (icon: info, blue) → opens detail drawer
- Update Bank Account (icon: pencil, pink) → toast "Coming soon"
- View Seller Profile (icon: user, blue) → toast "Coming soon"
- View Transaction (icon: receipt, blue) → navigate to transaction
- — divider —
- Add Internal Note (icon: sticky note, yellow) → toast "Coming soon"
- Block Payout (icon: ban, red, red text) → toast "Coming soon"

**Processing / Pending row** (e.g. PAY-2024-001235):
- View Processing Status (icon: info, blue) → opens detail drawer
- View Seller Profile (icon: user, blue) → toast
- View Transaction Details (icon: receipt, blue) → navigate to transaction
- — divider —
- Add Internal Note (icon: sticky note, yellow) → toast
- Pause Payout (icon: pause, orange, orange text) → toast
- Block Payout (icon: ban, red, red text) → toast

**Completed row** (e.g. PAY-2024-001236):
- View Completion Details (icon: check-circle, emerald) → opens detail drawer
- View Seller Profile (icon: user, blue) → toast
- View Transaction (icon: receipt, blue) → navigate to transaction
- — divider —
- Download Receipt (icon: download, blue) → toast
- Add Internal Note (icon: sticky note, yellow) → toast

**Blocked row** (existing fallback):
- View Block Reason → drawer
- Unblock Payout → existing handler
- View Seller Profile / View Transaction / Add Internal Note

**Awaiting release / On hold / Reversed (default):**
- View Details / View Seller Profile / View Transaction / Add Internal Note

## Implementation
- In `PayoutsTable.tsx`, replace the small `<DropdownMenuContent>` block (lines ~292-299) with a helper `renderRowMenu(r)` that branches on `r.status` + `r.release_blocked`.
- Use `react-icons/fa6` icons already imported, plus `FaCircleInfo`, `FaPenToSquare`, `FaUser`, `FaReceipt`, `FaNoteSticky`, `FaPause`, `FaDownload` (add to imports).
- Color each icon via tailwind text-{color}-400.
- Use `<DropdownMenuSeparator />` (add to import) for the dividers shown in the reference.
- For not-yet-wired actions, call `toast({ title: "<action> — coming soon" })`. Wire `View Seller Profile` to a placeholder (no seller profile route exists yet).
- Reuse existing handlers `onOpen` (drawer), `onOpenTransaction`, `onRetry`, `onUnblock` where applicable.

## Out of scope
Table layout, columns, status pill, pagination, mobile cards, real backend wiring for new actions (Pause/Block/Download Receipt/Internal Note/Update Bank Account/Seller Profile) — they show toasts for now.
