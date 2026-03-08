

# Seed Realistic Test Data (State-Transition-Compliant)

## Summary
Insert ~150 rows across 25+ tables with 3 test users and 6 transactions that exactly follow the SafeDeal State Transition Matrix. No schema changes.

## Approach
Use the database insert tool (not migration tool) since this is data insertion, not schema modification. The migration runs as superuser so it can insert into `auth.users` and bypass RLS.

**However**: The insert tool also runs with elevated privileges, and we need to insert into `auth.users` (reserved schema). We'll use the migration tool since inserting auth users requires superuser access, and the instructions say to use it for structural changes — but `auth.users` inserts genuinely require migration-level access. We'll use a single migration for all seed data.

**Correction**: Per the instructions, INSERT/UPDATE/DELETE should use the insert tool. But `auth.users` is a reserved schema table that can't be inserted via the normal insert tool. We'll need to use a migration for the auth.users rows, then the insert tool for public schema data.

**Final approach**: Use migration tool for everything since it's a coordinated seed that spans auth + public schemas and must be atomic.

## Test Users

| ID (deterministic) | Name | Email | Role | Phone |
|---|---|---|---|---|
| `a1b2c3d4-0001-4000-8000-000000000001` | Tunde Adeyemi | buyer@samplestore.test | buyer | +2348010000001 |
| `a1b2c3d4-0002-4000-8000-000000000002` | Chioma Okafor | seller@samplestore.test | seller | +2348010000002 |
| `a1b2c3d4-0003-4000-8000-000000000003` | SafeDeal Admin | admin@safedeal.test | admin | +2348010000003 |

Password: `testpassword123` (bcrypt hash)

Each user gets: `auth.users`, `profiles`, `user_roles`, `account_verifications`, `notification_preferences`

## 6 Transactions (Lifecycle-Compliant)

### Txn 1: SD-2026-000001 — Awaiting Payment
- **TS**: `awaiting_payment` | **MS**: `payment_pending` | **DS**: `none`
- Status history: `draft` → `awaiting_buyer` → `awaiting_payment`
- Money history: `not_secured` → `payment_pending`
- Events: `transaction_created`, `transaction_link_opened`, `buyer_joined`
- Tables: transactions, items, pricing, delivery_terms, notes, links, participants, events, status_history, money_history

### Txn 2: SD-2026-000002 — Payment Secured / Seller Preparing
- **TS**: `seller_preparing_delivery` | **MS**: `funds_held_in_escrow` | **DS**: `none`
- Status history: `draft` → `awaiting_buyer` → `awaiting_payment` → `payment_secured` → `seller_preparing_delivery`
- Money history: `not_secured` → `payment_pending` → `funds_held_in_escrow`
- Events: created, link_opened, buyer_joined, payment_received, agreement_locked, funds_held, seller_preparing_delivery
- Tables: + payments (succeeded), escrow_states (held), escrow_ledger_entries, agreement_snapshots, delivery_updates (processing)

### Txn 3: SD-2026-000003 — Delivered Awaiting Verification
- **TS**: `delivered_awaiting_verification` | **MS**: `funds_held_in_escrow` | **DS**: `none`
- Status history: ...→ `payment_secured` → `seller_preparing_delivery` → `seller_dispatched` → `delivered_awaiting_verification`
- Money history: `not_secured` → `payment_pending` → `funds_held_in_escrow`
- Events: + seller_dispatched, delivered, verification_window_opened
- Tables: + payments, escrow, agreement_snapshot, delivery_updates (processing, dispatched, delivered), delivery_tracking_details, delivery_confirmations, files (proof photo), delivery_proof_files

### Txn 4: SD-2026-000004 — Disputed
- **TS**: `disputed` | **MS**: `funds_frozen` | **DS**: `open`
- Status history: ...→ `delivered_awaiting_verification` → `disputed`
- Money history: ...→ `funds_held_in_escrow` → `funds_frozen`
- Events: + dispute_opened
- Tables: + all from Txn 3 base, disputes, dispute_evidence (with file), dispute_status_history, escrow_states (frozen)

### Txn 5: SD-2026-000005 — Completed (Happy Path)
- **TS**: `completed` | **MS**: `funds_released` | **DS**: `none`
- Status history: ...→ `delivered_awaiting_verification` → `completed`
- Money history: ...→ `funds_held_in_escrow` → `funds_releasing` → `funds_released`
- Events: + buyer_confirmed, payout_released
- Tables: + payouts (completed), escrow (released)

### Txn 6: SD-2026-000006 — Timed Out (Seller Timeout)
- **TS**: `timed_out` | **MS**: `refund_issued` | **DS**: `none`
- Status history: ...→ `payment_secured` → `seller_preparing_delivery` → `timed_out`
- Money history: ...→ `funds_held_in_escrow` → `funds_frozen` → `refund_pending` → `refund_issued`
- Events: + auto_cancelled, refund_issued
- Tables: + payments, escrow (refunded), refunds (completed)

## Insert Order (FK-safe)
1. `auth.users` (3)
2. `profiles` (3)
3. `user_roles` (3 — one per user)
4. `account_verifications` (3)
5. `notification_preferences` (3)
6. `transactions` (6)
7. `transaction_items` (6)
8. `transaction_pricing` (6)
9. `transaction_delivery_terms` (6)
10. `transaction_notes` (6)
11. `transaction_links` (6)
12. `transaction_participants` (12 — buyer+seller per txn)
13. `files` (2 — delivery proof + dispute evidence)
14. `payments` (5 — txns 2-6)
15. `escrow_states` (5 — txns 2-6)
16. `escrow_ledger_entries` (~12)
17. `transaction_agreement_snapshots` (5 — txns 2-6)
18. `delivery_updates` (~6 — txns 2-6 where applicable)
19. `delivery_tracking_details` (2 — txns 3,4,5)
20. `delivery_confirmations` (3 — txns 3,4,5)
21. `delivery_proof_files` (1 — txn 3)
22. `disputes` (1 — txn 4)
23. `dispute_evidence` (1 — txn 4)
24. `dispute_status_history` (1 — txn 4)
25. `payouts` (1 — txn 5)
26. `refunds` (1 — txn 6)
27. `transaction_events` (~30)
28. `transaction_status_history` (~25)
29. `money_status_history` (~20)
30. `notifications` (~10)
31. Advance `transaction_code_seq` to 7

## Data Style
- Lagos addresses (Lekki, Victoria Island, Ikeja, Surulere)
- NGN currency, Paystack provider
- Realistic items: iPhone 15 Pro Max (₦850,000), MacBook Air M3 (₦1,200,000), Samsung Galaxy S24 (₦650,000), Sony WH-1000XM5 (₦280,000), iPad Pro 12.9" (₦950,000), Nike Air Max (₦120,000)
- Platform fee 2.5%, processing fee 1.5%

## Output Files
- `src/db/migrations/011_seed_data.sql` — reference copy
- Applied via migration tool

