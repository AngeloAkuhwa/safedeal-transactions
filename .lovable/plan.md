

# Batch 6: Notifications, Audit, and System Monitoring

## Scope Adjustment

- **Skipping `webhook_logs`** — `payment_webhook_logs` from Batch 3 already covers this. The `webhook_event_status` enum will also be skipped.
- **5 tables** instead of 6: notifications, notification_deliveries, audit_logs, system_logs, background_jobs

## Enums (5)

1. **notification_type** — transaction_update, payment_update, delivery_update, dispute_update, verification_update, security_alert, system_message
2. **notification_channel** — in_app, email, sms, push
3. **notification_status** — pending, sent, failed, read
4. **audit_action_type** — profile_update, profile_suspend, profile_activate, transaction_created, transaction_cancelled, payment_received, payment_failed, payout_released, refund_processed, dispute_opened, dispute_resolved, verification_completed, system_action
5. **system_log_level** — info, warning, error, critical

## Table Creation Order

1. **notifications** — User notifications. Mutable (`updated_at` trigger). FKs: user_id → profiles.id (CASCADE), related_transaction_id → transactions.id (SET NULL). Indexes on (user_id, status) and (related_transaction_id).

2. **notification_deliveries** — Delivery attempts per notification. Append-only (no `updated_at`). FK: notification_id → notifications.id (CASCADE). Index on (notification_id).

3. **audit_logs** — Immutable admin/system audit trail. No `updated_at`. FKs: actor_user_id → profiles.id (SET NULL), target_user_id → profiles.id (SET NULL), transaction_id → transactions.id (SET NULL). Indexes on (action), (transaction_id), (actor_user_id).

4. **system_logs** — Immutable operational logs. No `updated_at`. Indexes on (level), (service_name).

5. **background_jobs** — Scheduled job tracking. Mutable (`updated_at` trigger). Indexes on (job_name), (job_status).

## FK Delete Behavior

- **notifications.user_id** → CASCADE (notifications belong to user lifecycle)
- **notifications.related_transaction_id** → SET NULL (keep notification even if transaction removed)
- **notification_deliveries.notification_id** → CASCADE (delivery attempts are child of notification)
- **audit_logs** — all FKs SET NULL (immutable records must survive parent deletion)
- **system_logs, background_jobs** — no FKs

## Mutability Rules

| Table | updated_at | Trigger |
|-------|-----------|---------|
| notifications | Yes | Yes |
| notification_deliveries | No | No |
| audit_logs | No | No |
| system_logs | No | No |
| background_jobs | Yes | Yes |

## Implementation

Single migration creating 5 enums and 5 tables with all indexes, FKs, and triggers. SQL copy saved to `src/db/migrations/007_batch6_notifications_audit.sql`. Post-migration verification via `pg_constraint` query.

