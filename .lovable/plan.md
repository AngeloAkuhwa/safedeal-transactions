
# Polish Admin Transaction Monitor → Detail Navigation

Goal: make the monitor and detail page feel like one connected SaaS workflow, without redesigning the detail page. All structural/visual additions are flagged in **"New UI elements"** below.

---

## 1. Preserve monitor state across navigation (no UI change)

Today the monitor only passes `returnTo` via `location.state`. If the user opens the detail page directly, hits browser back, or refreshes the monitor, all filters are lost.

**Fix in `src/pages/AdminTransactions.tsx`:**
- Mirror filter state into the URL using `useSearchParams`:
  - `q` (search), `quick`, `tab`, `page`, `sort` (`key:dir`), `txStatus`, `moneyStatus`, `disputeStatus`, `risk`, `amountMin`, `amountMax`, `dateFrom`, `dateTo`.
- On mount, hydrate state from URL params (fallbacks = current defaults).
- On change, debounce-update params with `setSearchParams(..., { replace: true })` so browser back stays clean.
- `goToDetail(row)` keeps passing `returnTo: location.pathname + location.search` so the detail Back button restores everything; URL params guarantee restoration even after refresh or direct entry.

**Detail page Back behavior (`AdminTransactionDetail.tsx`):**
- Keep `returnTo` from `location.state`; if absent, fall back to `/admin/transactions`.
- Browser back works automatically because we use `navigate(returnTo)` (push) and the monitor is now URL-driven.

---

## 2. Direct URL access + states (already mostly present, verify)

Already working: skeleton on load, `AdminAccessRequiredError` → forbidden card, `TransactionNotFoundError` → not-found card.

**Polish:**
- Tighten skeleton to mirror the actual layout (header strip + summary card + 2 stacked section blocks) instead of three identical 32h boxes.
- Forbidden / not-found cards get a consistent "Back to Transactions" button using `navigate(returnTo)`.

---

## 3. Desktop header polish — small additions (NEW UI, additive only)

Inside the existing sticky desktop header strip (no layout overhaul), add to the left cluster:

- **Breadcrumb row** above the H1: `Admin / Transactions / {transactionCode}` — text-xs muted, last segment highlighted. Replaces the current secondary subtitle line position; subtitle (item title + status) stays directly under H1 unchanged.
- **Compact copy button** next to the H1 transaction code: small icon button (`Copy` icon, h-3.5), tooltip "Copy code", success toast. (We already have a copy item in the dropdown — this surfaces it.)
- **Last synced indicator**: text-xs muted on the right side of the header, before the action buttons: `Synced {relTime(lastFetchedAt)}` with a small dot.
- **Live update dot**: small colored dot before "Synced …" — green pulse if realtime channel `SUBSCRIBED`, amber if `connecting`, gray if off. Reuses `liveSync` pattern already present in the monitor.

No other header restyling.

---

## 4. Section anchor nav on desktop (NEW UI, additive only)

Add a single thin sub-header strip directly under the sticky desktop header (still sticky, `top-[Xpx]` to sit below it). Contains horizontal scroll-spy links:

`Summary · Risk · Timeline · Records · Agreement · Payment · Delivery · Audit`

- Implementation: each existing section gets an `id` (most already do — `linked-records`, `escrow-ledger`, `payouts`; add `summary`, `risk`, `timeline`, `agreement`, `delivery`, `audit`).
- Click → `scrollToId` (already exists).
- Active link computed via `IntersectionObserver` on the section ids.
- Hidden on mobile (`hidden lg:flex`).

This is the only new structural strip on desktop.

---

## 5. Mobile

- No layout change. Sections already use `MobileAccordion` (collapsible).
- Sticky bottom action bar (Take Action + More) already exists — keep.
- Mobile header keeps Back / brand / menu trigger.
- Add small "Synced {relTime}" line as an unobtrusive caption inside the existing summary card subtitle area (text-[10px] muted) — no new bar.

---

## 6. Realtime subscription on detail page

Add a `useEffect` in `AdminTransactionDetail.tsx` that subscribes to a single Supabase channel `admin-tx-detail-${transactionId}` listening to `postgres_changes` on these tables, filtered by `transaction_id=eq.${transactionId}` where the column exists:

- `transactions` (filter `id=eq.${transactionId}`)
- `transaction_events`
- `money_status_history`
- `disputes` (filter `transaction_id=eq.${transactionId}`)
- `dispute_responses` (filter via dispute id if present, else listen to all and ignore non-matching in handler)
- `payments`
- `payouts`
- `escrow_ledger_entries`
- `admin_actions`

Behavior:
- Debounce changes (500–800 ms) to coalesce bursts.
- On change: bump `reloadKey` to trigger refetch; preserve scroll (do not call `scrollTo`).
- Toast: `toast("Transaction updated", { duration: 2500 })` — throttled to once per 5 s.
- Channel state drives `liveSync` (`connecting | live | off`) used by the header dot.
- Cleanup: `supabase.removeChannel(channel)` on unmount or transactionId change.

---

## 7. Animations (respect `prefers-reduced-motion`)

Use existing tailwind animation utilities (`animate-fade-in`, `animate-scale-in`). Wrap each application in a small helper:

```ts
const motionOk = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const anim = (cls: string) => motionOk ? cls : "";
```

Apply:
- Page header: `anim("animate-fade-in")`.
- Summary card: `anim("animate-fade-in")` (already uses `translateY`).
- Risk section when high risk: add a one-time subtle ring pulse — `anim("animate-fade-in ring-1 ring-red-500/30")` (no looping pulse, no shake).
- Timeline items: stagger via inline `style={{ animationDelay: i * 40ms }}` capped at 10 items, class `anim("animate-fade-in")`.
- Linked record cards: add `transition-transform hover:-translate-y-0.5` (subtle lift). No scale on money values.
- Action buttons: rely on existing shadcn hover.

No animation on monetary numbers.

---

## 8. Money formatting + label consistency

- Confirm every money render uses `formatMoney(value, "NGN")` — no `toFixed`, no shortening, no `K`/`M`.
- Replace any `tx?.status` raw rendering with the same `StatusPill` / `MoneyPill` used in the monitor row (already imported via `MoneyStatus.ts`). Add a quick audit: scan `AdminTransactionDetail.tsx` for raw `titleCase(tx?.status)` text usages and swap for `<StatusPill>` where appropriate (header subtitle stays as plain text since it's secondary).
- Empty linked records: keep existing `<Empty>` component; ensure Payment / Escrow / Payout / Delivery / Agreement sections all render `<Empty>No payment record yet.</Empty>` style copy when fields are null instead of "—" placeholders that look like data.

---

## 9. Monitor row → detail data parity

- Row click already navigates by `transactionId` — no change needed.
- Verify the monitor row's displayed `transactionCode`, `buyerTotal`, `txStatus`, `moneyStatus`, and `disputeStatus` come from the same fields the detail page uses (`tx.transactionCode`, `pricing.buyerTotal`, `tx.status`, `tx.moneyStatus`, `dispute.status`). They do — both endpoints read from `transactions` + `escrow_states` + `disputes`.
- Add a defensive log if `transactionCode` mismatches the monitor expectation (dev only, behind `import.meta.env.DEV`).

---

## 10. Files to change

- `src/pages/AdminTransactions.tsx` — URL-sync filter state via `useSearchParams`, hydrate on mount.
- `src/pages/AdminTransactionDetail.tsx` —
  - Realtime channel subscription + `liveSync` state.
  - `lastSyncedAt` state, updated on every successful refetch.
  - Breadcrumb, copy-code button, last-synced + live dot in desktop header.
  - New sticky desktop "section anchor" sub-strip with `IntersectionObserver`.
  - Section `id`s on Summary / Risk / Timeline / Agreement / Delivery / Audit cards.
  - Reduced-motion-aware animation classes.
  - Tighter skeleton matching real layout.
  - Mobile: tiny "Synced …" caption in summary subtitle.
- No edge function changes required.
- No DB migrations required.

---

## 11. New visual elements summary (all additive, no redesign)

1. Breadcrumb line in desktop header (text-xs).
2. Inline copy-code icon button next to H1.
3. "Synced {relTime}" + colored live dot in desktop header right side.
4. Thin sticky section-anchor nav strip below desktop header.
5. Subtle one-shot ring on the Risk card when high risk.
6. Hover lift on linked record cards.
7. Tiny "Synced …" caption on mobile summary subtitle.

Nothing else moves, no colors change, no card structure changes.

---

## Acceptance check

- Monitor filters survive: row click → back, browser back, page refresh, direct URL.
- Detail page: skeleton matches layout; clean forbidden / not-found states; breadcrumb + copy + last-synced + live dot visible on desktop.
- Realtime updates show subtle toast and refetch without scroll jump.
- Animations honor `prefers-reduced-motion`.
- All money values formatted as `₦` exact NGN, no abbreviations.
- Status labels on detail match monitor pills exactly.
