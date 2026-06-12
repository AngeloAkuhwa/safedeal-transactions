## Goal
End-to-end visual alignment of `/admin/payouts` table with the reference design. The header, KPI tiles, filters card, and pagination shell already match — gaps are inside table cells and the pagination buttons.

## Gaps to fix
1. **SELLER cell** — design shows avatar circle + seller name + tier subtitle. Current shows name + masked account.
2. **TRANSACTION cell** — design shows TXN code with an inline external-link icon. Current has no link icon.
3. **PAYOUT ACCOUNT cell** — design shows bank name + inline `VERIFIED`/`INVALID` chip + masked account + account-type label. Current shows bank + masked only.
4. **STATUS cell** — design shows pill with a small leading icon (✓ / × / spinner / clock). Current pill is text-only.
5. **PAGINATION** — design shows numbered pages with ellipsis (`1 2 3 … 22`) plus prev/next chevrons. Current shows only the current page + maybe next.

Everything else (header, KPI cards, filter card, tabs, "Payout Records" header, table columns, primary/Details/kebab actions, NGN currency) already matches.

## Changes (UI only)

### `src/components/admin/payouts/PayoutsTable.tsx`
- **Seller cell**: add an `Avatar` (shadcn) using `r.seller.avatar_url`, with initials fallback from `r.seller.name`. Subtitle = `r.seller.email ?? "Seller"`. Drop the masked-account subtitle (it's already in Payout Account column).
- **Transaction cell**: add a small `ExternalLink` icon button inline beside `r.transaction.code` that calls `onOpenTransaction(r)`; keep `item_title` subtitle.
- **Payout Account cell**: when account exists, render bank name + small `VERIFIED` (emerald) or `INVALID` (red) chip on the same row; subtitle shows masked account + " · " + account type if available (fall back to bank name only). When no account, keep red "No verified payout account".
- **Pagination**: replace current minimal nav with a numbered pager that always shows page 1, current ±1, last, with `…` separators; emerald active button. Wire to a new `onPageChange?: (page: number) => void` prop (no-op if not provided — keeps current call sites working) and trigger refetch.
- Header row + Refresh button + "X payouts found" stays as-is.

### `src/components/admin/payouts/PayoutStatusPill.tsx`
- Add a small leading lucide icon per status:
  - `awaiting_release` → `Clock`
  - `pending`/`processing` → `Loader2` (no spin)
  - `completed` → `CheckCircle2`
  - `failed` / `blocked` / `release_blocked` → `XCircle` / `Ban`
  - `reversed` → `Undo2`
  - `on_hold` → `Pause`
- Render `<icon /> {label}` inside the existing Badge with tight gap.

### `src/pages/AdminPayouts.tsx`
- Add `page` state and `onPageChange` handler; include `page` in `listPayouts({ tab, search, page, limit: 50 })`.
- Pass `page` and `onPageChange` to `PayoutsTable`.
- Reset page to 1 on tab/search change.

### Service / API
- `listPayouts` already accepts `page`. No service or backend changes.

## Out of scope
- No business-logic changes (eligibility, release, retry, batch).
- No mobile card changes (already compact and outside the desktop spec).
- No header/KPI/filter changes.
