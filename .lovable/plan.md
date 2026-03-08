

# Batch 9: Security, RLS Policies, Access Control, Helper Functions, and Performance Views

## Current State
- All 35 tables have RLS **enabled** but **zero policies** defined
- No sequences exist (needed for transaction code generator)
- `has_role(_user_id, _role)` security definer function already exists
- `update_updated_at_column()` trigger function already exists

## What This Batch Delivers
No new product tables. This is purely security, access control, and operational infrastructure.

---

## Part 1 — Security Helper Functions (4 functions)

### 1.1 `is_transaction_party(_user_id, _transaction_id)`
Security definer function that checks if a user is buyer, seller, or participant on a transaction. Used across many RLS policies to avoid recursive lookups.

### 1.2 `is_user_region_allowed(_user_id)`
Security definer function returning `is_region_eligible` from profiles. For Lagos-only rollout enforcement.

### 1.3 `invalidate_old_sessions(_user_id)`
Revokes all active sessions for a user. Called during login to enforce single-device access.

### 1.4 `generate_transaction_code()`
Creates readable codes like `SD-2026-000012`. Requires creating a `transaction_code_seq` sequence first.

---

## Part 2 — RLS Policies

Organized by access pattern. All policies target `authenticated` role.

### User-owned tables (SELECT own rows, INSERT/UPDATE own rows)
These tables use `auth.uid() = user_id` (or `id` for profiles):

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| profiles | own row | — (created by trigger) | own row | — |
| user_roles | own rows | — | — | — |
| devices | own rows | own rows | own rows | own rows |
| user_sessions | own rows | own rows | own rows | — |
| account_verifications | own row | — | — | — |
| notification_preferences | own row | own row | own row | — |
| notifications | own rows | — | own row (mark read) | — |

### Transaction-scoped tables (SELECT if party to transaction)
Use `is_transaction_party()` helper:

| Table | SELECT | INSERT | UPDATE |
|-------|--------|--------|--------|
| transactions | party | seller creates | seller/buyer updates own |
| transaction_items | party | seller | seller (draft only) |
| transaction_pricing | party | seller | seller (draft only) |
| transaction_delivery_terms | party | seller | seller |
| transaction_notes | party | seller | seller |
| transaction_links | party | seller | seller |
| transaction_participants | party | seller | — |
| transaction_media | party | seller | — |
| transaction_events | party | — (system) | — |
| transaction_status_history | party | — (system) | — |
| money_status_history | party | — (system) | — |
| transaction_agreement_snapshots | party | — | — |
| delivery_tracking_details | party | seller | seller |
| delivery_confirmations | party | — | — |
| delivery_updates | party | party | — |
| delivery_proof_files | party | party | — |
| payments | party | — | — |
| escrow_states | party | — | — |
| escrow_ledger_entries | party | — | — |
| payouts | seller on txn | — | — |
| refunds | buyer on txn | — | — |

### Dispute-scoped tables (SELECT if party to underlying transaction)

| Table | SELECT | INSERT | UPDATE |
|-------|--------|--------|--------|
| disputes | party to txn | buyer (open) | — |
| dispute_responses | party to txn | seller (respond) | — |
| dispute_evidence | party to txn | party (submit) | — |
| dispute_status_history | party to txn | — | — |
| dispute_outcomes | party to txn | — | — |

### Admin-only tables
Use `has_role(auth.uid(), 'admin')`:

| Table | SELECT | INSERT | UPDATE |
|-------|--------|--------|--------|
| admin_actions | admin | admin | — |
| case_reviews | admin | admin | — |
| system_settings | admin | admin | admin |
| timeout_rules | admin | admin | admin |
| audit_logs | admin | — | — |
| notification_deliveries | admin | — | — |

### System/logging tables (no user access via client)

| Table | Policy |
|-------|--------|
| system_logs | no client policies (service role only) |
| background_jobs | no client policies (service role only) |
| payment_webhook_logs | no client policies (service role only) |
| user_region_access_logs | admin SELECT, no user access |

### Public read tables

| Table | Policy |
|-------|--------|
| serviceable_regions | SELECT for all authenticated users |
| files | SELECT if user uploaded or is party to related transaction |

---

## Part 3 — Audit Safety (Delete Prevention Triggers)

Apply `prevent_delete()` trigger to financial tables:
- `payments`
- `escrow_ledger_entries`
- `payouts`
- `refunds`
- `escrow_states`

These tables already use RESTRICT FKs but the trigger adds an extra safety layer against direct deletes.

---

## Part 4 — Performance Views (3 views)

1. **`buyer_transactions_view`** — Transactions where `buyer_id = auth.uid()` with pricing and status
2. **`seller_transactions_view`** — Transactions where `seller_id = auth.uid()` with pricing and status
3. **`admin_dispute_summary_view`** — Disputes joined with transaction codes (admin only, secured by underlying RLS)

---

## Part 5 — Sequence

1. `transaction_code_seq` — Used by `generate_transaction_code()`

---

## Migration Execution Order

Single migration containing:
1. Create sequence
2. Create 4 helper functions
3. Create ~70 RLS policies across all 35 tables
4. Create `prevent_delete()` function + 5 triggers
5. Create 3 views

SQL copy saved to `src/db/migrations/010_batch9_security_rls.sql`.

---

## Critical Design Decisions

- **No self-referencing policies on profiles**: Uses `auth.uid() = id` directly, not a subquery on profiles
- **Transaction party check via security definer**: Prevents recursive RLS by encapsulating the lookup
- **Admin check via existing `has_role()`**: Already a security definer function
- **System tables get no client policies**: `system_logs`, `background_jobs`, `payment_webhook_logs` are service-role-only
- **Files table**: Users can see files they uploaded; transaction-party access handled through the linking tables (transaction_media, dispute_evidence, etc.)
- **INSERT policies are selective**: Only the appropriate actor (buyer/seller) can insert into specific tables
- **No DELETE policies on financial tables**: Combined with prevent_delete trigger for defense in depth

