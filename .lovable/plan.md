

# Batch 2: Transaction Core — Updated Enums

The plan from the previous message is unchanged except the enum values are updated to match your exact specifications:

## Updated Enums

1. **transaction_status** — draft, awaiting_buyer, awaiting_payment, payment_secured, seller_preparing_delivery, seller_dispatched, delivered_awaiting_verification, completed, disputed, cancelled, timed_out
2. **money_status** — not_secured, payment_pending, funds_held_in_escrow, funds_frozen, funds_releasing, funds_released, refund_pending, refund_issued
3. **dispute_status** — none, open, seller_response_pending, under_review, resolved
4. **transaction_party_role** — buyer, seller (unchanged)
5. **item_condition** — brand_new, like_new, excellent, good, fair, used
6. **delivery_method_type** — courier, pickup, meetup, hand_delivery

## Implementation

- Run one database migration creating all 6 enums + 7 tables (transactions, transaction_participants, transaction_items, transaction_pricing, transaction_delivery_terms, transaction_notes, transaction_links) with FKs, indexes, unique constraints, RLS enabled, and `updated_at` triggers
- Save a copy to `src/db/migrations/002_batch2_transaction_core.sql`
- No UI or API code

All other schema details (tables, columns, FKs, indexes) remain exactly as specified in the approved plan.

