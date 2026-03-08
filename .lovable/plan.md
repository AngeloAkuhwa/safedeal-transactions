

# Transaction State Machine — Implementation Plan

## Current State

Your project already has significant state machine infrastructure:

- **`transaction_status` enum** with 11 states (draft → completed/cancelled/timed_out)
- **`money_status` enum** with 8 states tracking escrow lifecycle
- **`dispute_status` enum** with 5 states
- **`transaction_status_history`** and **`money_status_history`** tables for full audit trails
- **Inline state guards** in `transaction-verify/index.ts` (e.g., checking `status === "delivered_awaiting_verification"` before allowing confirm/dispute)

What's **missing** is a centralized, enforced transition validator — currently each edge function does ad-hoc `if` checks, which is error-prone as more transitions are added.

## What We'll Build

### 1. Database Function: `validate_transaction_transition`

A PostgreSQL `SECURITY DEFINER` function that enforces the transition map at the database level. This is the strongest guarantee — even if edge function code has a bug, the DB rejects invalid transitions.

```sql
CREATE FUNCTION public.validate_transaction_transition(
  _current_status transaction_status,
  _new_status transaction_status
) RETURNS boolean
```

**Transition map encoded:**

| From | Allowed To |
|------|-----------|
| draft | awaiting_buyer, awaiting_payment, cancelled |
| awaiting_buyer | awaiting_payment, cancelled |
| awaiting_payment | payment_secured, cancelled, timed_out |
| payment_secured | seller_preparing_delivery, cancelled |
| seller_preparing_delivery | seller_dispatched, cancelled |
| seller_dispatched | delivered_awaiting_verification |
| delivered_awaiting_verification | completed, disputed, timed_out |
| disputed | delivered_awaiting_verification, completed, cancelled |
| completed | *(terminal)* |
| cancelled | *(terminal)* |
| timed_out | *(terminal)* |

### 2. Database Function: `validate_money_transition`

Same pattern for money status:

| From | Allowed To |
|------|-----------|
| not_secured | payment_pending |
| payment_pending | funds_held_in_escrow, not_secured |
| funds_held_in_escrow | funds_frozen, funds_releasing |
| funds_frozen | funds_held_in_escrow, refund_pending |
| funds_releasing | funds_released |
| funds_released | *(terminal)* |
| refund_pending | refund_issued |
| refund_issued | *(terminal)* |

### 3. Database Trigger: `enforce_transaction_transition`

A `BEFORE UPDATE` trigger on `transactions` that calls both validation functions when `status` or `money_status` changes. Invalid transitions raise an exception, preventing the write.

```sql
CREATE TRIGGER enforce_transaction_state_machine
BEFORE UPDATE ON public.transactions
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.money_status IS DISTINCT FROM NEW.money_status)
EXECUTE FUNCTION public.enforce_transaction_transitions();
```

### 4. Shared Edge Function Helper: `transitionTransaction`

A reusable helper within edge functions that:
1. Reads current state
2. Validates transition is allowed (client-side check before hitting DB)
3. Updates transaction with conditional WHERE clause (optimistic locking)
4. Inserts status history + money history + event in parallel
5. Returns success or throws

This consolidates the pattern already used in `confirmReceipt` and `raiseDispute` into a single reusable function.

### 5. Update Existing Edge Functions

Refactor `transaction-verify/index.ts` `confirmReceipt` and `raiseDispute` to use the shared helper, removing duplicated state-check boilerplate.

## Files

| File | Action |
|------|--------|
| `supabase/migrations/` | New migration: transition validation functions + trigger |
| `src/db/migrations/` | Mirror copy |
| `supabase/functions/transaction-verify/index.ts` | Refactor to use transition helper |

## What This Does NOT Change

- No new UI screens needed — the state machine is backend enforcement
- No changes to existing enums or tables — we're adding guardrails on top
- Existing edge function behavior stays identical — just better protected

## Security Benefit

Even with service-role access, the DB trigger prevents invalid transitions. This protects against:
- Edge function bugs allowing wrong state jumps
- Manual database edits skipping steps
- Race conditions causing double-releases

