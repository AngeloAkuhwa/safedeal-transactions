

# Batch 5: Transaction Events, Status History, Money Status History, Delivery Updates, Delivery Tracking, Delivery Confirmations

## Enums (3)

1. **transaction_event_type** — transaction_created, transaction_link_opened, buyer_joined, payment_received, agreement_locked, funds_held, seller_preparing_delivery, seller_dispatched, delivered, verification_window_opened, buyer_confirmed, dispute_opened, seller_responded, refund_issued, payout_released, auto_cancelled, auto_released
2. **transaction_actor_role** — buyer, seller, admin, system
3. **delivery_update_status** — processing, dispatched, delivered

## Table Creation Order

1. **transaction_events** — Canonical event stream. Append-only (no `updated_at`). FKs: transaction_id → transactions.id (RESTRICT), actor_user_id → profiles.id (SET NULL). Indexes on transaction_id, event_type, occurred_at.

2. **transaction_status_history** — Status transitions. Append-only. Uses existing `transaction_status` enum for old/new. FKs: transaction_id → transactions.id (RESTRICT), changed_by_user_id → profiles.id (SET NULL). Indexes on transaction_id, new_status, changed_at.

3. **money_status_history** — Money status transitions. Append-only. Uses existing `money_status` enum. FKs: transaction_id → transactions.id (RESTRICT), changed_by_user_id → profiles.id (SET NULL). Indexes on transaction_id, new_status, changed_at.

4. **delivery_updates** — Seller fulfillment progress. Append-only. FKs: transaction_id → transactions.id (CASCADE), updated_by_user_id → profiles.id (SET NULL). Indexes on transaction_id, status, created_at.

5. **delivery_tracking_details** — 1:1 with transaction. Mutable (has `updated_at` trigger). UNIQUE on transaction_id. FK: transaction_id → transactions.id (CASCADE). Index on tracking_number.

6. **delivery_confirmations** — 1:1 with transaction. Mutable (has `updated_at` trigger). UNIQUE on transaction_id. FK: transaction_id → transactions.id (CASCADE). Index on transaction_id.

## FK Delete Behavior Rationale

- **transaction_events, transaction_status_history, money_status_history** → RESTRICT on transaction_id. These are audit/history records and must not cascade-delete.
- **delivery_updates, delivery_tracking_details, delivery_confirmations** → CASCADE on transaction_id. These are structural child data of the transaction (same pattern as transaction_items, transaction_pricing, etc.).
- All profile references → SET NULL. User deletion should not destroy history records.

## Key Design Decisions

- Tables 1-4 are append-only (no `updated_at` column or trigger)
- Tables 5-6 are mutable 1:1 tables (have `updated_at` with trigger)
- `transaction_status_history` and `money_status_history` reuse existing enums (`transaction_status`, `money_status`) — no duplication
- RLS enabled on all 6 tables, policies deferred
- No unique constraints on event/history tables (multiple entries per transaction expected)
- `delivery_tracking_details` and `delivery_confirmations` have UNIQUE on transaction_id (1:1)

## Implementation

One database migration creating 3 enums and 6 tables. SQL copy saved to `src/db/migrations/006_batch5_events_history.sql`.

