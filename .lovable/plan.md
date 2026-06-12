Remove the horizontal scrollbar from the Payout Records table so all 9 columns fit within the card at the current admin viewport, while keeping the reference HTML's visual styling intact.

## Single file: `src/components/admin/payouts/PayoutsTable.tsx`

### 1. Table sizing
- Remove `min-w-[1200px]` on the `<table>` — replace with `w-full table-fixed`.
- Drop the `overflow-x-auto` wrapper (no longer needed).

### 2. Column widths
Add a `<colgroup>` with explicit widths so the fixed layout distributes columns predictably:
- Checkbox: 40px
- Payout ID: 14%
- Seller: 14%
- Transaction: 12%
- Amount: 11%
- Payout Account: 14%
- Status: 10%
- Initiated: 11%
- Actions: 14%

### 3. Cell density
- Cell padding: `p-4` → `px-3 py-3` so 9 columns fit comfortably.
- Header `<th>`: `p-4` → `px-3 py-3` (keep all other classes).

### 4. Truncation tweaks (so content wraps cleanly inside each fixed column)
- Payout ID text: `max-w-[160px]` → `max-w-full`.
- Seller name/email: `max-w-[160px]` → `max-w-full`.
- Transaction item subtitle: `max-w-[180px]` → `max-w-full`.
- Payout account bank name: `max-w-[140px]` → `max-w-full`.
- Add `min-w-0` on flex children that wrap text so `truncate` works in narrow cells.

### 5. Actions column compaction
- On screens narrower than `xl`, hide the secondary "Details" button (already `hidden md:inline-flex` — change to `hidden xl:inline-flex`) so Retry/View + kebab fit without overflow.

## Out of scope
- Mobile view (`PayoutMobileCards` already handles small screens).
- Any data/logic changes.
- No changes to other files.
