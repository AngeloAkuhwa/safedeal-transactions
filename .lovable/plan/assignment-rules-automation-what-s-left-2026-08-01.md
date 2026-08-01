# Assignment Rules & Automation — what's left

I re-checked the code against the full spec. Sections 1–8 (rules schema + `pickAgent` enforcement, Review-and-Save drawer with reason/approval, Test Configuration dry-run, Escalate drawer depth with reviewer + restrictions, clickable summary/productivity cards with tooltips and the "Range · Team" caption, export scopes with PII/financial masking, all nine notification events with dedupe keys and deep links, permissions + audit logging) are implemented and wired.

Two items from the Technical notes remain, both structural rather than behavioural:

## 1. Extract shared rules module
The spec asks for `supabase/functions/_shared/orchestration-rules.ts` exporting `pickAgent`, `applyRules`, `dedupeNotification`. Today all three live inline in `admin-task-orchestration-action/index.ts` (1,400+ lines). Move them into the shared module and import from both orchestration functions so the overview endpoint can reuse the same eligibility logic instead of duplicating filters.

## 2. Durable notification dedupe table
Dedupe currently works by scanning the last hour of `notifications` rows and comparing `metadata.dedupe_key`. That is correct but gets slower as the table grows and cannot express windows longer than the scan range.

Add `orchestration_notification_dedupe(event, key, first_sent_at, expires_at)` with a unique key on `(event, key)`, GRANTs to `service_role` only, RLS enabled with a service-role policy. Rewrite `dedupeNotification` to do an insert-on-conflict check against this table, and keep writing `dedupe_key` into notification metadata for traceability.

## Explicitly out of scope (unchanged)
- AgentDetailsDrawer Performance tab redesign.
- Cron/worker deployment is already done separately (5-min escalate, 10-min reassign jobs are live), so nothing further needed there.

## Technical summary
- New file: `supabase/functions/_shared/orchestration-rules.ts`.
- Edit: `admin-task-orchestration-action/index.ts`, `admin-task-orchestration-overview/index.ts` to import from it.
- One migration for the dedupe table (create → grant → enable RLS → policy).
- No UI changes; no behavioural change expected beyond faster dedupe lookups.
