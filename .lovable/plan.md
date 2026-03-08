

# Notifications Center -- Corrected Implementation Plan

## Schema Reality vs Requested Corrections

Three corrections require a **database migration** because the current schema doesn't match:

| Correction | Current Schema | Required |
|---|---|---|
| Read state | `status` enum (`pending`/`sent`/`failed`/`read`), plus `read_at` | Add `is_read` boolean column, use it + `read_at` for read logic |
| Notification types | Coarse enum: 7 values (`transaction_update`, `payment_update`, `delivery_update`, `dispute_update`, `verification_update`, `security_alert`, `system_message`) | Either expand enum to granular values OR store granular sub-type in `metadata.event_type` |
| Dispute routing | No `related_dispute_id` column | Add `related_dispute_id` UUID column referencing `disputes(id)` |

### Recommended approach

**Add `is_read` + `related_dispute_id` columns** via migration. For granular notification types, **keep the existing coarse enum** (it maps well to UI filter buckets already) and use `metadata.event_type` for granular sub-classification (e.g. `payment_received`, `funds_held`). This avoids a destructive enum rebuild while giving the CTA resolution logic the precision it needs.

## Migration

```sql
-- Add is_read boolean defaulting to false, backfill from status
ALTER TABLE public.notifications ADD COLUMN is_read boolean NOT NULL DEFAULT false;
UPDATE public.notifications SET is_read = true WHERE status = 'read';

-- Add related_dispute_id
ALTER TABLE public.notifications ADD COLUMN related_dispute_id uuid REFERENCES public.disputes(id) ON DELETE SET NULL;
CREATE INDEX idx_notifications_dispute ON public.notifications (related_dispute_id);
```

## Files to Create

### 1. `supabase/functions/buyer-notifications/index.ts`

Auth: same pattern as buyer-dashboard (Bearer token → `adminClient.auth.getUser(token)` → `has_role(userId, 'buyer')`).

**Phase 1 -- Summary counts** (partial-failure safe, defaults to zeros):
- `unread_count`: count where `user_id = userId` AND `is_read = false`
- `verification_deadlines_count`: count where `type = 'verification_update'` AND `is_read = false`
- `active_disputes_count`: count where `type = 'dispute_update'` AND `is_read = false`
- `escrow_alerts_count`: count where `type in ('payment_update', 'security_alert')` AND `is_read = false`
- Wrap in try/catch; on failure return zeros + `summary_partial: true`

**Phase 2 -- Filtered paginated list** (failure = 500, not fake empty):
- Params from body: `page` (default 1), `page_size` (default 20, max 50), `type` (UI bucket string, default "all"), `is_read` (optional boolean), `search` (optional string)
- UI bucket → DB type mapping:
  - `payments` → `['payment_update']`
  - `transaction_updates` → `['transaction_update']`
  - `delivery_updates` → `['delivery_update']`
  - `verification_reminders` → `['verification_update']`
  - `disputes` → `['dispute_update']`
  - `system_alerts` → `['security_alert', 'system_message']`
- Filter `is_read` using the boolean column, not `status`
- Search: ILIKE on `title` and `message` (MVP; transaction code search documented as follow-up)
- Select: `id, type, title, message, is_read, read_at, related_transaction_id, related_dispute_id, created_at, metadata`
- Paginate with `count: "exact"`

**Phase 3 -- Enrichment** (partial-failure safe):
- Collect unique `related_transaction_id` values → batch fetch `transactions(id, transaction_code, status, money_status)`
- Collect unique `related_dispute_id` values → batch fetch `disputes(id, status)` (just for route validation)
- Build maps; if enrichment fails, transaction/dispute fields become null

**CTA resolution** (per item, using `type` + `metadata.event_type` + enriched transaction state):
- `verification_update` → label "Verify Item Now", route `/dashboard/transactions/{txId}/verify`
- `delivery_update` → label "View Delivery Proof", route `/dashboard/transactions/{txId}`
- `dispute_update` → if `related_dispute_id` exists: label "View Dispute", route `/dashboard/disputes/{disputeId}`; else `null`
- `payment_update` → if transaction status is `completed`: label "View Receipt"; else label "View Transaction"; route `/dashboard/transactions/{txId}`
- `transaction_update` → label "View Details", route `/dashboard/transactions/{txId}`
- `security_alert` / `system_message` → if `related_transaction_id` exists: label "View Transaction", route `/dashboard/transactions/{txId}`; else `null`
- If required ID is missing → `primary_action = null`

**Response shape**:
```json
{
  "summary": { "unread_count", "verification_deadlines_count", "active_disputes_count", "escrow_alerts_count" },
  "items": [{
    "id", "db_type", "ui_type",
    "title", "message", "is_read", "read_at", "created_at",
    "transaction": { "id", "code", "status", "money_status" } | null,
    "dispute": { "id" } | null,
    "primary_action": { "label", "route" } | null
  }],
  "pagination": { "page", "page_size", "total_count", "total_pages" }
}
```

### 2. `supabase/functions/buyer-notifications-read/index.ts`

Same auth pattern. Reads body: `{ notification_id?: string, mark_all?: boolean }`.

- **Single**: update `notifications` set `is_read = true`, `read_at = now()`, `status = 'read'` where `id = notification_id` AND `user_id = userId`. Return 404 if no rows updated.
- **Bulk**: update `notifications` set `is_read = true`, `read_at = now()`, `status = 'read'` where `user_id = userId` AND `is_read = false`.
- Response: `{ success: true, updated_count: N }`
- Keep `status` column in sync (set to `'read'`) for backward compatibility with any existing queries.

### 3. `src/services/notifications.service.ts`

- `BuyerNotificationFilters`: `{ page?, page_size?, type?, is_read?, search? }`
- `NotificationItem`, `NotificationSummary`, `BuyerNotificationsResponse` interfaces matching response shape above
- `getBuyerNotifications(filters)`: invoke `buyer-notifications`
- `markNotificationRead(id)`: invoke `buyer-notifications-read` with `{ notification_id }`
- `markAllNotificationsRead()`: invoke `buyer-notifications-read` with `{ mark_all: true }`

### 4. `src/pages/BuyerNotifications.tsx`

Keep planned visual structure: BuyerNav → hero/header → summary cards → filters → notification list → empty/error state → footer.

React Query:
- `useQuery(["buyer-notifications", debouncedFilters])`
- `useMutation` for mark-read with optimistic updates (toggle `is_read` in cache) + invalidation
- `useMutation` for mark-all-read with cache reset + invalidation

### 5. `src/components/notifications/NotificationSummaryCards.tsx`

4-card grid using summary object. Display zeros on partial failure.

### 6. `src/components/notifications/NotificationFilters.tsx`

- Search input
- Type dropdown using UI bucket labels (All Types, Payments, Transaction Updates, Delivery Updates, Verification Reminders, Disputes, System Alerts)
- Unread only checkbox

### 7. `src/components/notifications/NotificationList.tsx`

- Left border color by `ui_type` (not raw `db_type`)
- Show action button ONLY if `primary_action !== null`
- Show transaction code from `transaction.code` if available
- Show type tag from `ui_type`
- Visual read/unread distinction (font weight, background, badge)

### 8. `src/components/notifications/NotificationEmptyState.tsx`

Two variants: no notifications at all vs no filter matches.

## Files to Modify

### `src/App.tsx`
Add: `<Route path="/dashboard/notifications" element={<BuyerNotifications />} />`

### `supabase/config.toml`
Add:
```toml
[functions.buyer-notifications]
verify_jwt = false

[functions.buyer-notifications-read]
verify_jwt = false
```

## Key decisions documented

- **Search MVP**: title + message only. Transaction code search is a documented follow-up.
- **Granular event types**: Stored in `metadata.event_type`, not as new enum values. The coarse `type` enum maps directly to UI filter buckets.
- **Backward compat**: `status = 'read'` is set alongside `is_read = true` so existing dashboard queries still work.
- **No redesign**: Visual structure, component hierarchy, and design system unchanged.

