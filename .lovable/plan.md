

# Batch 7: Disputes, Responses, Evidence Links, Status History, and Outcomes

## Enums (4)

1. **dispute_reason_type** — wrong_item_received, damaged_item_received, incomplete_order, item_not_as_described, item_not_delivered, suspected_fake_item, other
2. **dispute_case_status** — open, seller_response_pending, under_review, resolved
3. **dispute_evidence_type** — buyer_photo, buyer_video, seller_receipt, seller_tracking, seller_product_photo, supporting_document, other
4. **dispute_outcome_type** — refund_buyer, release_funds_to_seller, close_case_without_resolution

## Table Creation Order

1. **disputes** — Root case record. 1:1 with transaction (UNIQUE on transaction_id). Mutable (`updated_at` trigger). FKs: transaction_id → transactions.id (RESTRICT), opened_by_user_id → profiles.id (RESTRICT). Indexes on transaction_id, opened_by_user_id, status.

2. **dispute_responses** — Seller's formal response. 1:1 with dispute (UNIQUE on dispute_id). Mutable (`updated_at` trigger). FKs: dispute_id → disputes.id (RESTRICT), responded_by_user_id → profiles.id (RESTRICT). Index on responded_by_user_id.

3. **dispute_evidence** — Evidence file links from buyer or seller. Append-only (no `updated_at`). Reuses `transaction_actor_role` enum from Batch 5 for `submitted_by_role`. FKs: dispute_id → disputes.id (RESTRICT), submitted_by_user_id → profiles.id (RESTRICT), file_id → files.id (RESTRICT). Indexes on dispute_id, submitted_by_user_id, file_id, evidence_type.

4. **dispute_status_history** — Case state transitions. Append-only (no `updated_at`). FKs: dispute_id → disputes.id (RESTRICT), changed_by_user_id → profiles.id (SET NULL). Indexes on dispute_id, new_status, changed_at.

5. **dispute_outcomes** — Final resolution. 1:1 with dispute (UNIQUE on dispute_id). Mutable (`updated_at` trigger). Includes refund_amount and release_amount for financial linkage. FKs: dispute_id → disputes.id (RESTRICT), resolved_by_user_id → profiles.id (RESTRICT). Indexes on resolved_by_user_id, outcome_type.

## FK Delete Behavior Summary

| Table | Column | Target | On Delete |
|-------|--------|--------|-----------|
| disputes | transaction_id | transactions.id | RESTRICT |
| disputes | opened_by_user_id | profiles.id | RESTRICT |
| dispute_responses | dispute_id | disputes.id | RESTRICT |
| dispute_responses | responded_by_user_id | profiles.id | RESTRICT |
| dispute_evidence | dispute_id | disputes.id | RESTRICT |
| dispute_evidence | submitted_by_user_id | profiles.id | RESTRICT |
| dispute_evidence | file_id | files.id | RESTRICT |
| dispute_status_history | dispute_id | disputes.id | RESTRICT |
| dispute_status_history | changed_by_user_id | profiles.id | SET NULL |
| dispute_outcomes | dispute_id | disputes.id | RESTRICT |
| dispute_outcomes | resolved_by_user_id | profiles.id | RESTRICT |

Rationale: All dispute records are permanent trust/legal artifacts. Only `dispute_status_history.changed_by_user_id` uses SET NULL (consistent with other history tables where the actor context is supplementary).

## Mutability

| Table | updated_at | Trigger |
|-------|-----------|---------|
| disputes | Yes | Yes |
| dispute_responses | Yes | Yes |
| dispute_evidence | No | No |
| dispute_status_history | No | No |
| dispute_outcomes | Yes | Yes |

## Unique Constraints

- disputes: UNIQUE (transaction_id) — one dispute per transaction
- dispute_responses: UNIQUE (dispute_id) — one seller response per dispute
- dispute_outcomes: UNIQUE (dispute_id) — one outcome per dispute

## Implementation

Single migration creating 4 enums and 5 tables. SQL copy saved to `src/db/migrations/008_batch7_disputes.sql`.

