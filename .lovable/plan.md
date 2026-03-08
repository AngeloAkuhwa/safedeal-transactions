

# Batch 8: Admin Actions, Case Reviews, System Settings, and Timeout Rules

## Scope After Conflict Resolution

**Skipped** (already exist from Batch 6):
- `notifications` table — keeping as-is
- `notification_deliveries` table — keeping as-is
- `background_jobs` table — keeping as-is
- `notification_type`, `notification_channel`, `notification_status` enums — keeping as-is
- `job_runs` table — `background_jobs` covers this
- `notification_delivery_status` and `job_run_status` enums — not needed

**Creating (4 tables, 3 enums):**
1. `admin_actions`
2. `case_reviews`
3. `system_settings`
4. `timeout_rules`

## Enums (3)

1. **admin_action_type** — freeze_transaction, request_evidence, extend_deadline, escalate_case, refund_buyer, release_funds, close_case, flag_user, unflag_user, update_setting
2. **timeout_rule_type** — seller_fulfillment_timeout, buyer_verification_timeout
3. ~~notification_type~~ — skipped, already exists
4. ~~notification_channel~~ — skipped
5. ~~notification_delivery_status~~ — skipped
6. ~~job_run_status~~ — skipped

## Tables

### 8.1 admin_actions
Admin action log. Immutable (no `updated_at`). FKs: admin_user_id → profiles.id (RESTRICT), transaction_id → transactions.id (SET NULL), dispute_id → disputes.id (SET NULL), target_user_id → profiles.id (SET NULL). Indexes on admin_user_id, transaction_id, dispute_id, target_user_id, action_type.

### 8.2 case_reviews
Internal dispute review notes. Immutable (no `updated_at`). FKs: dispute_id → disputes.id (RESTRICT), reviewed_by_user_id → profiles.id (RESTRICT). Indexes on dispute_id, reviewed_by_user_id.

### 8.3 system_settings
Centralized platform config. Mutable (`updated_at` trigger). No FKs. UNIQUE on setting_key. Index on setting_key.

### 8.4 timeout_rules
Configurable timeout behavior. Mutable (`updated_at` trigger). No FKs. UNIQUE on rule_type. Indexes on rule_type, is_active.

## Mutability

| Table | updated_at | Trigger |
|-------|-----------|---------|
| admin_actions | No | No |
| case_reviews | No | No |
| system_settings | Yes | Yes |
| timeout_rules | Yes | Yes |

## FK Delete Behavior

| Table.Column | Target | On Delete |
|---|---|---|
| admin_actions.admin_user_id | profiles.id | RESTRICT |
| admin_actions.transaction_id | transactions.id | SET NULL |
| admin_actions.dispute_id | disputes.id | SET NULL |
| admin_actions.target_user_id | profiles.id | SET NULL |
| case_reviews.dispute_id | disputes.id | RESTRICT |
| case_reviews.reviewed_by_user_id | profiles.id | RESTRICT |

## Implementation

Single migration creating 2 enums and 4 tables with indexes, constraints, and triggers. SQL copy saved to `src/db/migrations/009_batch8_admin_settings.sql`.

