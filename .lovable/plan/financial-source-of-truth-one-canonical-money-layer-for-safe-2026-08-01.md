# Financial source of truth — one canonical money layer for SafeDeal

## What the data actually shows today (verified against the live database)

Real rows confirm the contradictions you are seeing:

- **SD-2026-000021**: buyer charged 12,880 (item 12,345 + fees 535). Escrow held 12,345, but the release wrote a ledger debit of **12,880** and set escrow released to **12,880** — the full buyer charge including fees. Meanwhile the payout row says **12,095** and is still `pending`. Three different "release" numbers for one deal.
- **SD-2026-000019**: identical pattern — held 20,000, ledger debit and released 20,780, payout row 19,620, still `pending`.
- **Seller payout is computed inconsistently**: SD-2026-000023 stores seller payout = item (12,345); SD-2026-000021 stores item minus platform fee (12,095); SD-2026-000019 stores 19,620 for a 20,000 item. The written money policy says seller payout = item amount.
- **SD-2026-000024**: transaction status `completed`, money status `funds_pending_release`, escrow still `held`, payout `failed` with no completion timestamp, plus a stale `failed` payment of 12,880 attached to a 38,479 transaction.
- **Escrow released before money moves**: escrow released amounts are being written while the payout is still `pending`/`failed`.
- **Dashboard vs Escrow use different queries**: the Dashboard mismatch card sums three 30-day database checks (missing-deposit, duplicate ledger rows, orphan completed payouts). The Escrow page reads drift rows from the latest reconciliation run in a different table. They can never agree.
- **Payout detail reads a column that does not exist** (`payments.paid_at`), so the payment panel on payout detail silently returns nothing.
- **Fee entries sit in the same ledger** as cash movements but are excluded from the reconciliation signed sum, so the ledger balance and escrow aggregates drift apart.

## The fix, in plain terms

One place computes money. Everything else displays what that place says.

### 1. Canonical financial model (shared backend module)

A single `financial-model` module in the shared edge-function layer returns, per transaction, in minor units (kobo integers — no floating point):

item subtotal, buyer protection fee, processing fee, discounts, taxes, total buyer charge, amount captured, amount held in escrow, refunded amount, seller release amount, platform revenue, processing cost, payout amount, remaining balance, currency.

It derives every figure from the immutable pricing snapshot plus the ledger — never by re-running pricing formulas at read time. A matching read-only mirror is exposed to the frontend as a typed service so no page component ever does money arithmetic.

### 2. Ledger event model

Standardise the ledger event vocabulary so each movement is recorded exactly once: payment authorized, payment captured, funds placed in escrow, partial refund, full refund, release approved, funds released, payout initiated, payout completed, payout failed, reversal/adjustment. Fee records are tagged as non-cash so they no longer distort balances. Every entry carries a reference type and reference id, and a uniqueness rule on (transaction, entry type, reference) blocks duplicate movements from repeat clicks or webhook replays.

### 3. Correct the release/payout money path

- Release debits the **seller release amount**, never the buyer's total charge.
- Seller release amount comes from the pricing snapshot only, using one rule.
- Escrow released amount increases only when the payout actually completes; approval alone moves funds to a pending-release position.
- A release or refund cannot exceed the available escrow balance — enforced in the database function, not just the UI.

### 4. Reconciliation, one query, everywhere

A single reconciliation routine compares, per transaction:
captured vs escrowed + refunded + released + remaining; approved release vs actual payout; displayed totals vs ledger totals.

It assigns one status per transaction: **Reconciled**, **Pending settlement**, **Mismatch**, **Requires review**.

The Dashboard reconciliation card and compliance state call the same routine as the Escrow page, with the same filters, so the counts are identical by construction.

### 5. Remediation report instead of silent rewrites

No historical row is edited automatically. A new admin-only **Financial remediation** report lists each affected transaction with: current stored values, canonically calculated values, the difference, the suspected cause, and a recommended action. Fixes are applied one record at a time, with a reason, confirmation, and an audit entry. Backfills run as dry-run first and print a validation report.

### 6. Payout detail correctness

Payout ID, transaction ID, item, seller, payout-account owner, amount, status and timestamps each read their proper field (fixing the non-existent payment column). A `completed` payout with no completion timestamp renders **"Unavailable"** and is flagged into the remediation report rather than showing a blank.

### 7. Consumers switched over

Transaction detail, Disputes, Escrow, Payouts, Flagged Users, Dashboard summaries, CSV exports and audit records all read the canonical model. Summary cards are recomputed from the same filtered record set they display, so card totals always equal the rows beneath them.

## Technical detail

- New `supabase/functions/_shared/financial-model.ts`: kobo-integer money type, canonical line-item builder, ledger projection, invariant checks. Pure functions, unit-testable.
- New `supabase/functions/_shared/reconciliation.ts`: single implementation of the four comparisons plus status derivation; consumed by `admin-dashboard`, `admin-escrow-overview`, `admin-reconciliation`, `reconcile-escrow`.
- Migrations: non-cash flag + partial unique index on `escrow_ledger_entries`; balance guards inside `release_payout_atomic`, `complete_payout_atomic`, `complete_refund_atomic`; a `reconciliation_status` view/function keyed by transaction. No destructive changes, no data rewrites.
- Edge function fixes: `admin-payouts-detail` (`payments.paid_at` → `captured_at`), `release-core.ts` release amount source, `reconcile-escrow` entry-type sets.
- Frontend: new `src/services/financial-model.service.ts` typed contract; `AdminReconciliation` gains the remediation report tab; Escrow/Payouts/Dashboard/Transactions/Disputes/Flagged Users read canonical fields. Existing dark admin design system, components, hooks and permission keys reused — no new permission system.
- Permissions: report and remediation actions gated behind existing `financial_controls.view` and a mutation-only key for applying a correction.
- Tests (Vitest + shared-module tests): full release, partial refund, full refund, failed payout, retry, adjustment/reversal, mismatch detection, duplicate-submission idempotency, and dashboard-equals-escrow count parity.

## Sequence

1. Shared financial model + reconciliation modules, with tests.
2. Migrations: ledger uniqueness, non-cash flag, balance guards, reconciliation status.
3. Rewire release/refund/payout paths to the canonical amounts.
4. Point Dashboard and Escrow at the one reconciliation query.
5. Switch remaining screens and exports to the canonical model; fix payout detail fields and timestamps.
6. Build the admin remediation report and dry-run backfill validation.
7. Verify against SD-2026-000019 / 21 / 23 / 24 and report results.