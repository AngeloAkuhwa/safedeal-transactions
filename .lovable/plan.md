# Complete the Flags column on Admin Transactions

## Why some rows show "—" today

The backend (`admin-transactions-monitor`) only attaches **risk/operational** flags:
`escalated`, `high_risk`, `fraud_watch`, `frozen`, `admin_frozen`, `overdue`,
`payment_failed`, `payout_failed`, `risk_flagged`.

Healthy rows (`funds_held`, `completed`, `released`, `draft`, `cancelled`, `refunded`,
`awaiting_payment` not yet overdue) intentionally return `flags: []`, so the UI renders `—`.

That's correct logic — but for a monitor screen we want every row to read at a glance.

## Fix (UI only, single file)

**File: `src/pages/AdminTransactions.tsx`**

1. Add a third metadata map `NEUTRAL_FLAG_META` for lifecycle pills derived from
   `transactionStatus.key` / `moneyStatus.key` when no risk/operational flag exists:
   - `funds_held` / money `held` → "Held Safely" (sky/blue)
   - `delivered` / `awaiting_verification` → "Awaiting Confirm" (amber)
   - `in_transit` → "In Transit" (indigo)
   - `released` / `completed` → "Released" (emerald)
   - `refunded` → "Refunded" (slate)
   - `cancelled` → "Cancelled" (zinc)
   - `draft` → "Draft" (zinc/dashed)
   - `awaiting_payment` (not overdue) → "Awaiting Payment" (amber)
   Each entry includes an `Icon` already in the `lucide-react` import set
   (`ShieldCheck`, `Clock`, `Truck`, `CheckCircle2`, `RotateCcw`, `Ban`, `FileText`, `Hourglass`).
   Add only the icons not already imported.

2. Update `buildFlagBadges(t)`:
   - Keep current logic: risk badge from `riskLevel` + secondary flags from `flags[]`.
   - **If the resulting list is still empty**, push a single neutral pill derived from
     `transactionStatus.key` (fall back to `moneyStatus.key`). If neither maps, return `[]`
     and keep the `—` placeholder.

3. Pass `transactionStatus` and `moneyStatus` into `buildFlagBadges` (signature change to
   `{ riskLevel, flags, transactionStatus, moneyStatus }`). Update both call sites
   (desktop table cell, mobile card badge row) accordingly.

4. Visual rules (unchanged):
   - Cap at **2 visible pills** + `+N` overflow chip with tooltip listing the rest.
   - Neutral pills use lower-contrast classes (e.g. `bg-slate-500/10 text-slate-300 border-slate-500/30`)
     so they don't visually compete with risk pills.
   - Keep `Icon` decorative (`aria-hidden`), label remains the source of truth for screen readers.

## Acceptance

- Every row in the Admin Transactions table (desktop + mobile) shows at least one
  meaningful pill: a risk/operational badge when present, otherwise a neutral lifecycle pill.
- Risk and operational badges still take priority and are rendered first.
- `—` only appears for rows with no mappable status (should be effectively never with current data).
- No backend changes; only `src/pages/AdminTransactions.tsx` is touched.
