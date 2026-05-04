## Plan: Make admin transaction rows/cards clickable → detail page

### 1. New route + page

**`src/App.tsx`** — register:
```tsx
<Route path="/admin/transactions/:transactionId" element={<AdminTransactionDetail />} />
```
inside the existing admin `ProtectedRoute requireRole="admin"` block.

**New file `src/pages/AdminTransactionDetail.tsx`**:
- Reads `transactionId` from `useParams()`.
- Calls existing `getAdminTransactionDetail(transactionId, ["timeline","ledger","messages","summary"])` from `src/services/admin-transaction-actions.service.ts` (already used by `DetailDrawer`).
- Layout uses `AdminLayout` (same shell as `AdminTransactions`).
- Sections: header (back button, code, status pills, key amounts), Timeline, Ledger, Messages, Linked Records (buyer/seller, payment ref, escrow). Reuses `Badge`/status helpers from `AdminTransactions.tsx` (extracted minimally inline; no styling overhaul — V1 mirrors the DetailDrawer data plus a richer header).
- Back button: `navigate(returnTo ?? "/admin/transactions")` where `returnTo` is taken from `location.state.returnTo` (full path with query string) — preserves filters.
- Loading / error states + 403 → admin denied message.

### 2. Make rows clickable (`src/pages/AdminTransactions.tsx`)

Add a helper inside the component:
```ts
const goToDetail = (t: AdminTxRow) => {
  navigate(`/admin/transactions/${t.transactionId}`, {
    state: { returnTo: `${location.pathname}${location.search}` },
  });
};
```
(`useLocation` already importable from `react-router-dom`; `navigate` already in scope.)

**Desktop `<tr>` (line ~815)**:
- Add `onClick={() => goToDetail(t)}`, `onKeyDown` handler (Enter/Space → goToDetail), `tabIndex={0}`, `role="button"`, `aria-label={`Open transaction ${t.transactionCode}`}`.
- Append classes: `cursor-pointer hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 active:bg-muted/80` (keeps existing `rowStateClass(t)` risk styling because it's applied first).

**Mobile `<article>` (line ~961)**:
- Same pattern: `onClick`, `onKeyDown`, `tabIndex={0}`, `role="button"`, `aria-label`. Classes add `cursor-pointer hover:bg-muted/30 active:scale-[0.998] transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/50`.

### 3. Stop propagation on action controls

To prevent action buttons from triggering row navigation:

- **`IconBtn`** (line ~1175 in `AdminTransactions.tsx`) — wrap its `onClick`:
  ```ts
  onClick={(e) => { e.stopPropagation(); onClick(); }}
  ```
  Update prop type to accept the event. This covers View, Add Internal Note icons used in the table.
- **Mobile "View" `<button>`** (line ~1036) — add `e.stopPropagation()` in its onClick.
- **`RowActionsMenu`** (`src/components/admin/transactions/RowActionsMenu.tsx`) — wrap the trigger button (kebab) `onClick` with `e.stopPropagation()`, and add `onClick={(e) => e.stopPropagation()}` on the `DropdownMenuContent` so menu-item clicks don't bubble to the row.
- **Snowflake icon / Badges** are non-interactive → no change needed.

### 4. Accessibility / UX detail

- Use `onKeyDown` matching `Enter` and `Space` (preventDefault on Space to avoid page scroll).
- `aria-label="Open transaction {transactionCode}"` on both row and card.
- Keep existing eye-icon View button (still works, just stops propagation).
- High-risk row tints (`rowStateClass`) remain — hover layer is `bg-muted/60` over the tint so risk color stays visible.

### 5. State preservation

- Outbound: pass `state: { returnTo }` containing the current `pathname + search` (filters/page/sort are already mirrored to URL search params in many flows; if not, the `returnTo` still preserves whatever URL the user is on). No new query-param plumbing required for v1 because filters live in component state — but pressing Back via the new detail page restores the same `/admin/transactions` URL.
- Optional follow-up (not in this change): persist filters to URL search params for true cross-tab durability.

### 6. Files touched

- `src/App.tsx` — add route.
- `src/pages/AdminTransactionDetail.tsx` — new page.
- `src/pages/AdminTransactions.tsx` — clickable row + card, `IconBtn` stopPropagation, navigation helper with `returnTo` state.
- `src/components/admin/transactions/RowActionsMenu.tsx` — stopPropagation on trigger + content.

### Acceptance check (after build)

- Click anywhere on a desktop row (outside the action column buttons) → navigates to `/admin/transactions/:id`.
- Click anywhere on a mobile card (outside View/kebab) → navigates.
- Eye icon, note icon, kebab menu and its items do NOT navigate.
- Enter on a focused row navigates.
- Back from detail returns to `/admin/transactions` with prior URL state.
- Risk-tinted rows still show their tint and respond to hover.
