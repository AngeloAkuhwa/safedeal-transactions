# Admin Transaction Detail — Real Action Workflows (v2)

Goal: every action on `/admin/transactions/:transactionId` triggers a real, permission-gated, audited admin workflow. No decorative buttons, no fake data. All money in NGN with 2 decimals. No redesign of the detail page; only new dialogs/drawer in the existing visual style.

## Design changes (called out)

New components only — no layout/section redesign:

1. `InvestigationDrawer` — right-side `Sheet` on desktop, full-screen on mobile.
2. `FreezeFundsDialog`, `UnfreezeFundsDialog`, `ExportDataDialog` — replace generic confirm dialog usage.
3. `InternalNoteDialog` — extended (categories + follow-up) in place.

All use existing shadcn primitives, dark theme tokens, and tone classes already on the page.

---

## 1. Database migration

```sql
-- Investigations
create type public.admin_investigation_status as enum
  ('open','under_review','escalated','resolved','dismissed');
create type public.admin_investigation_priority as enum
  ('low','medium','high','critical');

create table public.admin_investigations (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique
    references public.transactions(id) on delete restrict,
  status admin_investigation_status not null default 'open',
  priority admin_investigation_priority not null default 'medium',
  assigned_admin_id uuid references auth.users(id),
  tags text[] not null default '{}',
  opened_by_user_id uuid not null references auth.users(id),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  last_updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.admin_investigations enable row level security;
create policy "admins read investigations" on public.admin_investigations
  for select to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "admins write investigations" on public.admin_investigations
  for all to authenticated using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));
create trigger trg_admin_investigations_uat before update on public.admin_investigations
  for each row execute function public.update_updated_at_column();

-- Money transition: allow unfreeze back to held; do NOT allow released → frozen
create or replace function public.validate_money_transition(_old money_status,_new money_status)
returns boolean language plpgsql immutable security definer set search_path=public as $$
begin
  if _old = 'refund_issued' then return false; end if;
  return case _old
    when 'not_secured'          then _new in ('payment_pending')
    when 'payment_pending'      then _new in ('funds_held_in_escrow','not_secured')
    when 'funds_held_in_escrow' then _new in ('funds_pending_release','funds_frozen')
    when 'funds_pending_release'then _new in ('funds_releasing','funds_frozen','refund_pending')
    when 'funds_frozen'         then _new in ('funds_held_in_escrow','funds_pending_release','refund_pending')
    when 'funds_releasing'      then _new in ('funds_released','funds_pending_release')
    when 'funds_released'       then false  -- terminal: no freeze after release
    when 'refund_pending'       then _new in ('refund_issued')
    else false end;
end$$;

-- Atomic unfreeze that preserves the frozen amount
create or replace function public.unfreeze_funds_atomic(
  p_transaction_id uuid,
  p_actor uuid,
  p_target money_status,
  p_reason text
) returns money_status language plpgsql security definer set search_path=public as $$
declare
  v_old money_status;
  v_frozen numeric;
  v_new_state escrow_state;
begin
  if p_target not in ('funds_held_in_escrow','funds_pending_release') then
    raise exception 'invalid_target:%', p_target;
  end if;

  select money_status into v_old from public.transactions
    where id = p_transaction_id for update;
  if v_old is null then raise exception 'transaction_not_found'; end if;
  if v_old <> 'funds_frozen' then raise exception 'not_frozen:%', v_old; end if;

  select coalesce(frozen_amount,0) into v_frozen
    from public.escrow_states where transaction_id = p_transaction_id for update;

  v_new_state := case
    when p_target = 'funds_pending_release' then 'pending_release'::escrow_state
    else 'held'::escrow_state
  end;

  -- Move the frozen amount back to held_amount (single secured pool).
  -- The money_status itself signals whether the held amount is held or pending release.
  update public.escrow_states
     set held_amount   = coalesce(held_amount,0) + v_frozen,
         frozen_amount = greatest(0, coalesce(frozen_amount,0) - v_frozen),
         state         = v_new_state,
         last_changed_at = now(),
         updated_at    = now()
   where transaction_id = p_transaction_id;

  update public.transactions
     set money_status = p_target,
         needs_release_review = false,
         release_review_reason = null,
         updated_at = now()
   where id = p_transaction_id;

  insert into public.money_status_history(transaction_id,old_status,new_status,changed_by_user_id,reason)
    values (p_transaction_id, v_old, p_target, p_actor, coalesce(p_reason,'admin_unfreeze'));

  -- Audit ledger entry to keep internal truth balanced (zero-sum reclassification)
  insert into public.escrow_ledger_entries(
    transaction_id, entry_type, amount, currency_code, reference_type, reference_id, notes
  ) values (
    p_transaction_id, 'adjustment', 0,
    coalesce((select currency_code from public.transactions where id=p_transaction_id),'NGN'),
    'admin_unfreeze', p_transaction_id,
    concat('unfreeze: ', v_frozen::text, ' moved frozen→', p_target::text)
  );

  return p_target;
end$$;
```

Released funds becoming terminal removes the existing `reverse_payout_atomic` path of `funds_released → funds_frozen`. That function will be updated to instead set `transactions.needs_release_review = true` with `release_review_reason = 'transfer_reversed'` (already done elsewhere in that function) without changing `money_status`. Post-release reviews use that flag, not the money state.

---

## 2. Edge function changes

### `admin-transaction-actions/index.ts` (extend)

All cases continue to: gate on `has_role('admin')`, write `admin_actions`, `audit_logs`, and a `transaction_events` row.

- `upsert_investigation` — payload `{ status, priority, assigned_admin_id?, tags?, note? }`.
  - Validate enums. UPSERT into `admin_investigations` keyed by `transaction_id`.
  - First insert sets `opened_by_user_id`, `opened_at`. Updates set `last_updated_by`. Status `resolved`/`dismissed` sets `resolved_at = now()`; other statuses clear it.
  - History: insert `admin_actions` (`open_investigation` or `update_investigation`), `audit_logs` (with full diff in `metadata`: prev/next status, priority, assignee, tags), `transaction_events` (`admin_investigation_opened` / `admin_investigation_updated`). If `note` provided, also insert `admin_transaction_notes` with prefix `[investigation]`.
  - The drawer reads this audit history to render the timeline of investigation changes; the row stays unique per tx.

- `freeze` (extend) — payload `{ reason, category, severity, note? }`.
  - Reject if `tx.money_status` is `funds_released` or `refund_issued` → `Funds already released; cannot be frozen.`
  - Reject if already `funds_frozen` → `Funds are already frozen.`
  - Reject if no escrowed amount: `held_amount + (any pending) <= 0` → `No escrowed funds available to freeze.`
  - Otherwise call existing `freeze_funds_atomic` (already idempotent and preserves amount via state machine).
  - Audit: `admin_actions` (`freeze_transaction`), `audit_logs` (`admin_freeze`, metadata = category/severity/reason), `transaction_events` (`admin_funds_frozen`).

- `unfreeze` (replace) — payload `{ reason, target_money_status, note?, acknowledge_open_dispute? }`.
  - Reject if `tx.money_status <> 'funds_frozen'` → `Funds are not currently frozen.`
  - If active dispute exists AND target is `funds_pending_release` AND `acknowledge_open_dispute !== true` → `Active dispute requires acknowledgement before moving to pending release.`
  - Call `unfreeze_funds_atomic(tx_id, admin_id, target, reason)`.
  - Never triggers payout. Never sets `funds_releasing` / `funds_released`.
  - Audit: `admin_actions` (`unfreeze_transaction`), `audit_logs` (`admin_unfreeze`, metadata = target/reason), `transaction_events` (`admin_funds_unfrozen`).

- `add_internal_note` (extend) — payload `{ note, category, follow_up_required?, follow_up_priority? }`.
  - Categories: `general | payment | escrow | dispute | delivery | evidence | payout | risk`.
  - 5–2000 chars. Stores note prefixed `[category]`. Metadata in `audit_logs` includes follow-up flags.
  - If `follow_up_required` and tx is non-terminal, also call `flag_for_release_review(tx, 'manual_hold', admin, note)`.
  - Always inserts `transaction_events` (`admin_note_added`).

### New `admin-export-transaction-data/index.ts`

- POST only; same admin-gate pattern as siblings; CORS `POST, OPTIONS`.
- Body:
  ```ts
  {
    transaction_id: string;
    include_summary: boolean;
    include_agreement: boolean;          // summary/snapshot only
    include_payment_ledger: boolean;
    include_timeline: boolean;
    include_dispute_summary: boolean;
    include_evidence_metadata: boolean;
    include_admin_notes: boolean;
    reason: string;                      // required, min 8 chars
  }
  ```
- Server-side composes ONLY the requested slices via service-role queries that already exist for `admin-transaction-detail`.
- Strict redaction:
  - **No raw evidence files.** Evidence entries include only: `id, kind, title, mime_type, uploaded_at, uploaded_by_role, verification_status, file_hash` if present. No `storage_path`, `signed_url`, `download_url`, `cloudinary_url`, or any URL field.
  - **No downloadable agreement file.** Agreement section returns the immutable JSONB snapshot summary (terms, locked_at, parties), no PDF link or file URL.
  - Payment ledger uses `escrow_ledger_entries` rows (already non-PII) plus payment summary; no Paystack secrets.
- Audit: insert `admin_actions` (`export_data`), `audit_logs` (`admin_export`, metadata = chosen sections + reason + byte size), `transaction_events` (`admin_export_generated`). Repeated exports each create their own audit rows.
- Response: `{ filename, generatedAt, payload }`. Client downloads as a JSON blob built from the response.

### `admin-transaction-detail/index.ts`

- Add `investigation` slice: latest `admin_investigations` row joined with assignee profile + last 50 `transaction_events` whose type starts with `admin_investigation_`.
- Confirm `adminActionsAvailable` flags reflect the new freeze rules: `canFreeze` only when `money_status ∈ {funds_held_in_escrow, funds_pending_release}` AND not already frozen AND not released/refunded; `canUnfreeze` only when `money_status = 'funds_frozen'`.

---

## 3. Service layer (`src/services/admin-transaction-actions.service.ts`)

Add typed helpers wrapping the existing `invokeAction` and a new `exportTransactionData` that calls `admin-export-transaction-data`:

```ts
upsertInvestigation(transactionId, { status, priority, assigned_admin_id?, tags?, note? })
freezeTransactionDetailed(transactionId, { reason, category, severity, note? })
unfreezeTransactionDetailed(transactionId, { reason, target_money_status, note?, acknowledge_open_dispute? })
addInternalNoteDetailed(transactionId, { note, category, follow_up_required?, follow_up_priority? })
exportTransactionData(transactionId, options)
```

All errors propagate the server message into the dialog, which surfaces a `toast.error`.

---

## 4. UI

New under `src/components/admin/transactions/`:

- **`InvestigationDrawer.tsx`** — `Sheet` (right on `lg`, full-screen on mobile).
  - Top: tx code, status pills, money pill, parties, item, risk flags, dispute snippet, escrow amount.
  - Form: status (5 enum values), priority (4 enum values), assignee (admin combobox; falls back to current admin), tag multi-select (fixed list: `payment | dispute | delivery | user_risk | fraud_risk | evidence_conflict | payout_risk`), note textarea, save / cancel.
  - History list below the form: renders the `audit_logs` + `admin_actions` returned by the detail edge function for `admin_investigation_*` events (who/when/what changed). This satisfies "drawer must show current status plus historical changes."
  - Pre-populates from `data.investigation` when present; otherwise fields show defaults (`status=open`, `priority=medium`).

- **`FreezeFundsDialog.tsx`**
  - Reasons: Dispute opened / Suspicious buyer activity / Suspicious seller activity / Conflicting evidence / Payment risk / Delivery risk / Manual admin review / Other (free text required).
  - Severity: low/medium/high/critical.
  - Note (≤1000), confirmation checkbox required.
  - Copy: *"Freezing funds pauses payout/refund movement while the transaction is reviewed. It does not move money out of SafeDeal escrow."*

- **`UnfreezeFundsDialog.tsx`**
  - Reasons: Dispute resolved / Risk cleared / Evidence reviewed / False flag / Manual correction / Other.
  - Target state radio. Default: if both `buyer_confirmed_at` and `seller_confirmed_at` present → `funds_pending_release`, else `funds_held_in_escrow`.
  - If active dispute exists and target = `funds_pending_release`, show warning banner with checkbox `acknowledge_open_dispute`.
  - Required confirm checkbox: *"I understand this does not release funds."*
  - Copy: *"Unfreezing removes the manual hold. It does not release funds to the seller. Release still follows the normal SafeDeal release process."*

- **`InternalNoteDialog.tsx`** (extend)
  - Category select with 8 options.
  - `follow_up_required` checkbox + priority select (low/medium/high/urgent).
  - 5–2000 char validation, internal-only badge.

- **`ExportDataDialog.tsx`**
  - Eight checkboxes (defaults: summary on, agreement summary on, payment ledger on, timeline on, dispute summary on, evidence metadata on, admin notes off; "include raw evidence/file" is **not an option**).
  - Reason textarea (min 8 chars), required.
  - Warning banner: *"Exports may contain sensitive transaction information. This action is audited."*
  - On submit: call `exportTransactionData`, build a blob from the response payload, trigger a download, then `toast.success("Export generated")`.

`AdminTransactionDetail.tsx` updates:

- Replace freeze/unfreeze/investigate `ActionConfirmDialog` usages with the four new dialogs/drawer.
- Replace client-only `exportData()` with `setExportOpen(true)` + `ExportDataDialog`.
- Keep the high-risk red banner CTA "Investigate" — it calls `setInvestigateOpen(true)` (same handler as "Open Investigation"). Everywhere else use "Open Investigation" / "Update Investigation".
- After every action handler resolves: `setReloadKey(k => k + 1)` to refetch detail. Realtime channel already auto-refetches but the manual refetch removes any race.
- Refresh covers: summary, money pill, escrow card, risk flags, investigation drawer history, timeline, action button visibility (since the edge function recomputes `adminActionsAvailable`).
- Toasts via `sonner` with success/error messages from server.

Permissions: all gating uses `data.adminActionsAvailable` flags from the detail edge function (server-derived from `has_role` + state). No client-only checks.

---

## 5. Acceptance verification

- `funds_released → funds_frozen` is rejected by `validate_money_transition` (DB test).
- Unfreezing preserves the frozen amount: `escrow_states.held_amount` increases by the previously frozen amount; `frozen_amount` becomes 0; the secured-amount UI reads correctly.
- Unfreeze never triggers payout (no `payouts` row mutation, no `funds_releasing` transition).
- Investigation history is readable in the drawer (audit logs + admin actions for `admin_investigation_*`).
- Export: payload contains no `storage_path`, no `signed_url`, no `download_url`, no agreement file URL; evidence entries only contain metadata fields.
- Every successful action produces a `transaction_events` row with the correct type and the detail page updates without a manual reload.
- `formatMoney(value, "NGN")` is the only money formatter on both pages.

## Files touched

- `supabase/migrations/<new>_admin_investigations_freeze_workflow.sql`
- `supabase/functions/admin-transaction-actions/index.ts` (extend)
- `supabase/functions/admin-transaction-detail/index.ts` (add `investigation` slice)
- `supabase/functions/admin-export-transaction-data/index.ts` (new)
- `src/services/admin-transaction-actions.service.ts` (extend)
- `src/components/admin/transactions/InvestigationDrawer.tsx` (new)
- `src/components/admin/transactions/FreezeFundsDialog.tsx` (new)
- `src/components/admin/transactions/UnfreezeFundsDialog.tsx` (new)
- `src/components/admin/transactions/ExportDataDialog.tsx` (new)
- `src/components/admin/transactions/InternalNoteDialog.tsx` (extend)
- `src/pages/AdminTransactionDetail.tsx` (swap dialogs, remove client-side export)

No other pages or layouts are redesigned.
