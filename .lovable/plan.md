
# Admin Monitor ↔ Detail Data Consistency Pass

## Goal
Guarantee every field shown for a transaction in the Admin Transaction Monitor list matches the corresponding field on the Admin Transaction Detail page. Today both sides have their own inline `mapTxStatus` / `mapMoneyStatus` / `mapDisputeStatus` / `mapEscrowState` / risk-flag / formatting logic, which is the root cause of label drift risk.

No UI redesign. No new sections. No visual changes to either page. Only:
- shared mapping helpers,
- a dev-only consistency checker,
- unit tests,
- minor wiring so both APIs return the same shapes for the consistency-critical fields.

## Scope of fields covered
`id`, `code`, `itemTitle`, `buyerName`, `sellerName`, `totalAmount`, `protectionFee`, `sellerNetAmount`, `moneyStatus`, `transactionStatus`, `disputeStatus`, `escrowStatus`, `riskFlags`, `lastActivity`, `paymentProvider`, `payoutStatus`.

---

## 1. Shared admin mapper module (single source of truth)

Create **`supabase/functions/_shared/admin-mappers.ts`** (Deno-side) and a mirrored **`src/lib/admin-mappers.ts`** (browser-side). Both files export the same pure functions with identical outputs:

- `mapTransactionStatus(status)` → `{ key, label, tone }`
- `mapMoneyStatus(status)` → `{ key, label, tone }` (e.g. `funds_held_in_escrow` → `{ key: "held", label: "Held in Escrow" }`)
- `mapDisputeStatus(status)` → `{ key, label, tone }`
- `mapEscrowState(state)` → `{ key, label, tone }`
- `mapPayoutStatus(status)` → `{ key, label, tone }`
- `mapRiskLevel(tx)` → `{ level: "clean"|"escalated"|"high_risk"|"fraud_watch", flags: string[] }`
- `formatCurrencyNGN(amount)` → always `₦x,xxx.xx` (2 decimals, no abbreviation)
- `getLastActivity(tx, events?)` → `{ iso, label, tone }`
- `buildRiskFlags(tx, parties, disputeOverdue)` → `{ label, severity }[]`

Resolution rule: the **detail label is canonical** and the **monitor short label is derived from it**. Specifically the monitor "Held" stays as "Held" by reading the same entry's `short` field; on the detail page the full `label` ("Held in Escrow") is shown. Both come from the same record. This eliminates drift while preserving the existing column compactness.

Both files import / re-export the same constants. The Deno file is a verbatim copy (no shared bundler between edge functions and Vite). A short comment at the top of each says: "Mirror of the other; keep in sync. CI test guards against divergence."

## 2. Wire monitor & detail edge functions to the shared mappers

- `supabase/functions/admin-transactions-monitor/index.ts`: delete inline `mapTxStatus`, `mapMoneyStatus`, `mapDisputeStatus`, `mapEscrowState`, `relativeTimeLabel`; import from `_shared/admin-mappers.ts`. Each row now also returns `consistencyKey` fields (raw enum + label + key) so the detail can be compared 1:1.
- `supabase/functions/admin-transaction-detail/index.ts`: replace ad-hoc `tx.dispute_status.replace(/_/g," ")`, escrow `(escrow.state ?? "").replace(/_/g," ")`, etc., and the inline `flags` builder, with calls to the shared mappers / `buildRiskFlags`. Also add `numeric` versions of `totalAmount`, `protectionFee`, `sellerNetAmount` (already numeric — confirm) so values match the monitor row exactly.

## 3. Frontend integration

- `src/pages/AdminTransactions.tsx` and `src/pages/AdminTransactionDetail.tsx`: when rendering status/money/dispute/escrow/payout pills, route through `src/lib/admin-mappers.ts` rather than locally inferred strings. Existing `<StatusPill>` / `<MoneyPill>` components are kept; they just receive the shared label + tone.
- `src/services/admin-transactions-monitor.service.ts` and `admin-transaction-detail.service.ts`: type the responses to include the canonical raw + key fields so the consistency hook can compare without re-deriving.

## 4. Dev-only consistency check

Add **`src/lib/admin-consistency.ts`** exporting `assertMonitorDetailConsistent(monitorRow, detailPayload)`.

- Compares all 16 fields listed above.
- In `import.meta.env.DEV`, logs a single grouped `console.warn("[admin-consistency] mismatch", { field, monitor, detail })` per drift; in prod the function is a no-op.
- Wire it into `AdminTransactionDetail.tsx`: when the user navigates from the monitor (we already pass state via the row click), the prior row snapshot is read from `location.state.monitorRow`. After the detail loads we call the assertion.
- No UI is added — it is purely a console-time guard.

## 5. Unit tests

Add **`src/lib/__tests__/admin-mappers.test.ts`** (Vitest) covering:
- Every `TxStatus`, `MoneyStatus`, `DisputeStatus`, `EscrowState`, `PayoutStatus` enum value maps to a non-empty label and a known tone.
- `formatCurrencyNGN(5356)` === `"₦5,356.00"`, `formatCurrencyNGN(0)` === `"₦0.00"`, `formatCurrencyNGN(null)` === `"—"`.
- Cross-check helper: for each known money status, the monitor `short` and detail `label` describe the same state (e.g. `held` short ↔ "Held in Escrow" full).
- 7 realistic mocked transactions are fed through both `mapMonitorRow` and `mapDetailPayload` adapters and asserted to produce matching values for the 16 fields:
  1. completed
  2. awaiting_payment
  3. funds_held (`payment_secured` + `funds_held_in_escrow`)
  4. in_dispute (`disputed` + active dispute)
  5. frozen (`funds_frozen`)
  6. refunded (`refund_issued`)
  7. failed (timed_out / payment failure)

Add **`supabase/functions/admin-transactions-monitor/admin_mappers.test.ts`** (Deno) running the same enum-coverage assertions on the Deno copy to prevent server/client drift.

## 6. Acceptance verification

- Manual: open `/admin/transactions`, click each of the 7 fixtures, confirm zero `[admin-consistency]` warnings in dev console.
- Tests: `bunx vitest run src/lib/__tests__/admin-mappers.test.ts` and Deno test for the edge mapper both green.
- Money: every NGN value rendered on both pages comes from `formatCurrencyNGN` (2 decimals, no abbreviation).

## Files touched

New
- `supabase/functions/_shared/admin-mappers.ts`
- `supabase/functions/admin-transactions-monitor/admin_mappers.test.ts`
- `src/lib/admin-mappers.ts`
- `src/lib/admin-consistency.ts`
- `src/lib/__tests__/admin-mappers.test.ts`

Modified (logic only, no visual change)
- `supabase/functions/admin-transactions-monitor/index.ts` — replace inline mappers
- `supabase/functions/admin-transaction-detail/index.ts` — replace inline mappers / risk flag builder
- `src/services/admin-transactions-monitor.service.ts` — extend response types
- `src/services/admin-transaction-detail.service.ts` — extend response types
- `src/pages/AdminTransactions.tsx` — render via shared mappers; pass row snapshot in nav state
- `src/pages/AdminTransactionDetail.tsx` — render via shared mappers; call dev-only assertion

## Design changes
None. The transaction detail page UI stays exactly as-is. Only label strings sourced from the shared mapper may change in two minor places to align with the canonical copy:
- Monitor money column for `funds_held_in_escrow` continues to show "Held" (uses `short`); detail continues to show "Held in Escrow" (uses `label`).
- Detail dispute subtitle stops using `replace(/_/g," ")` raw text and uses the canonical dispute label (e.g. "Awaiting Seller" instead of "seller response pending"). This is a copy correction, not a redesign — flagging here per your instruction.
