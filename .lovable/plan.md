

# Batch 1 — Identity, Access, Verification, Security & Rollout Control

## Prerequisites

Supabase needs to be connected to this project first. Currently no Supabase instance is configured. We'll need to set that up before running any migrations.

## Creation Order

Tables must be created in this order due to foreign key dependencies:

1. Enums (`user_role_type`, `profile_status`)
2. `serviceable_regions` (no FK dependencies)
3. `profiles` (references `auth.users`)
4. `user_roles` (references `profiles`)
5. `devices` (references `profiles`)
6. `user_sessions` (references `profiles` and `devices`)
7. `account_verifications` (references `profiles`)
8. `notification_preferences` (references `profiles`)
9. `user_region_access_logs` (references `profiles`)

## Enums

- **`user_role_type`**: `buyer`, `seller`, `admin`
- **`profile_status`**: `active`, `suspended`, `blocked`

No additional enums needed for this batch — `access_result` in the logs table works fine as plain text since the values may evolve.

## Tables & Notes

### `serviceable_regions`
Exactly as specified. Unique constraint on `(country_code, state_name, city_name)`. Seeded with Lagos entry.

### `profiles`
- `id` will be `uuid primary key references auth.users(id) on delete cascade` — directly links to Supabase Auth
- All columns as specified
- **Small improvement:** Add `default_region_id uuid null references serviceable_regions(id)` — lets us link a user to their serviceable region directly for faster eligibility checks. This is optional but avoids repeated city-name string matching.

### `user_roles`
Exactly as specified. Unique on `(user_id, role)`. Will later use a `has_role()` security-definer function for RLS.

### `devices`
Exactly as specified. Index on `(user_id)`.

### `user_sessions`
Exactly as specified. Index on `(user_id, is_active)`. FK to both `profiles` and `devices`.

### `account_verifications`
Exactly as specified. **Small improvement:** Add `unique(user_id)` since each user should have exactly one verification record.

### `notification_preferences`
Exactly as specified. Already has `unique` on `user_id`.

### `user_region_access_logs`
Exactly as specified. `user_id` is nullable (for unauthenticated attempts). Index on `(user_id)` and `(created_at)` for audit queries.

## Suggested Improvement Summary

| Change | Reason | Risk |
|--------|--------|------|
| `profiles.default_region_id` FK to `serviceable_regions` | Avoids string matching for region eligibility | None — nullable, optional |
| `account_verifications` unique on `user_id` | One record per user, prevents duplicates | None — matches intent |

Both are optional. Happy to drop either if you prefer the schema exactly as written.

## RLS Preparation

All tables will have `alter table ... enable row level security` applied immediately. Actual policies will be added in a dedicated RLS pass after all batches, using `has_role()` security-definer function.

## Implementation

Single Supabase migration file containing all enums, tables, indexes, and constraints in dependency order. No frontend changes. No data inserts (except optionally seeding Lagos into `serviceable_regions`).

