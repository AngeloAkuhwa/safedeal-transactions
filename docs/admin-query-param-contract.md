# Admin query-param contract

Documentation only — no code impact. Every admin screen below lists the URL query
params it actually **reads**. Any link emitted from another screen must use one of
these keys, otherwise the filter is silently dropped (the class of defect fixed in
Fix 7). Add a row here whenever a screen starts reading a new param.

| Screen | Route | Params read | Source |
|---|---|---|---|
| Transactions | `/admin/transactions` | `q`, `quick`, `risk`, `sort`, `page` | `AdminTransactions.tsx` |
| Transaction detail | `/admin/transactions/:transactionId` | `tab`, `disputeId` | `AdminTransactionDetail.tsx` |
| Disputes | `/admin/disputes` | `q`, `quick`, `reason`, `priority`, `money_status`, `page` | `AdminDisputes.tsx` |
| Payouts | `/admin/payouts` | `tab`, `range`, `amount`, `bank`, `quick`, `from`, `to`, `payout_id` | `AdminPayouts.tsx` |
| Flagged users | `/admin/flagged-users` | `u`, `risk`, `reason`, `range`, `status`, `sort`, `q`, `page` | `AdminFlaggedUsers.tsx` |
| Audit logs | `/admin/audit-logs` | `ref` | `AdminAuditLogs.tsx` |
| Access control | `/admin/access-control` | `user`, `role` | `AdminAccessControl.tsx` |
| Permission matrix | `/admin/permission-matrix` | `tab`, `role`, `module`, `risk`, `since` | `AdminPermissionMatrix.tsx` |
| Task orchestration | `/admin/task-orchestration` | `task`, `action`, `rebalance`, `agent`, `rules_change` | `AdminTaskOrchestration.tsx` |
| Agent performance | `/admin/agent-performance` | `tab`, `scope`, `sla_state`, `sla_agent`, `sla_priority`, `sla_stage`, `sla_page` | `AdminAgentPerformance.tsx` |

## Rules for emitters

1. **User-scoped links** into Transactions or Disputes use `?q=<user_id>` (the shared
   search param) — not `?user=`, which no screen reads.
2. **User-scoped links** into Flagged Users use `?u=<user_id>`, not `?user_id=`.
3. **Actor/target history links** into Audit Logs use `?ref=<id>`.
4. **Never interpolate an optional id** into a path (`/admin/transactions/${x?.id}`);
   guard the control so it does not render when the id is absent.
5. **Non-existent destinations** must go through `useAdminNav().go(href, label)`, which
   checks `BUILT_ROUTES` and shows a "Coming soon" toast instead of a dead navigation.
6. Route paths, `BUILT_ROUTES` (`useAdminNav.ts`) and `admin-route-permissions.ts` stay
   in lockstep; the smoke suite (`src/__tests__/admin-routes.smoke.test.tsx`) covers
   routes and URL-driven tabs.