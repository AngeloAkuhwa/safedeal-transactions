# Agent Performance — remaining gaps and fix plan

Not 100% done. The all-time contract, dedup, scope metadata, `contract_version`, SLA state mapping, SLA summary block and the Review SLA deep link are in place. The gaps below are confirmed by reading the current backend function and tab components.

## Confirmed gaps

1. **SLA tab is client-side and capped.** The backend returns at most 500 SLA rows (`.slice(0, 500)`) and the tab filters state/agent in the browser. Counts, chips and table disagree with the dashboard once the cap is hit, and only one state can be selected at a time despite the multi-state requirement.
2. **SLA summary averages ignore scope and tracking.** First-action and resolution averages are computed over all scoped tasks, not the SLA-tracked, in-window case set backing the table.
3. **"Paused" is assumed.** Every waiting status maps to Paused instead of preserving the stored `sla_status` where the workflow does not pause the clock.
4. **SLA table is task-only.** Dispute-backed cases with no orchestration task never appear, so "route dispute rows to the dispute view" is unreachable.
5. **Workload vs Completion chart is wrong.** It plots current active load versus lifetime resolved per agent instead of cases assigned per bucket versus cases completed in that bucket.
6. **SLA compliance trend plots only a compliance line.** Compliant / at-risk / breached counts are not plotted separately, and the excluded Not Configured / Paused denominator is not surfaced.
7. **Status distribution excludes dispute-only resolutions**, so the pie total does not reconcile with the resolved KPI.
8. **Agent comparison implies "best" from a composite score** with no complexity, escalation or reassignment context, and falls back to `sla ?? 0`, which reads as 0% compliance for untracked agents.
9. **No calculation/data-source tooltips or sample notes** on charts, and no sample sizes on metric-grid tiles, so dispute-only fallback averages are indistinguishable from task-backed ones.
10. **Case drawer has no pagination UI.** The backend accepts `page`/`page_size` and returns totals, but the drawer never requests page 2 — busy agents still lose history behind a truncation note.
11. **Dead code:** `AgentSLADrawer.tsx` is unreferenced after the deep-link change.
12. **No tests and no dev reconciliation assertions** for range vs all-time, dedup, orphan outcomes, missing due dates, empty denominators or URL restoration.

## Fix plan

### Backend — `supabase/functions/admin-agent-performance/index.ts`
- Move SLA state/agent/team/role/priority/stage filtering server-side; accept `sla_states[]`, `sla_page`, `sla_page_size`; return `sla_total`, page metadata and full-set state counts so chips stay correct beyond the current page.
- Include dispute-only resolved cases as `source: "dispute"` rows with state `not_configured`, excluded from compliance denominators.
- Compute SLA summary averages from the same tracked, in-window case set the table uses; keep `null` when the denominator is zero.
- Preserve stored `sla_status` for waiting cases; map to Paused only for waiting states that actually pause the clock.
- Add per-bucket `assigned`/`completed` plus `on_track`, `at_risk`, `breached` counts to the trend payload; add dispute-only resolutions to the status-distribution resolved bucket.
- Return sample sizes and task-vs-dispute source split alongside each average; bump `contract_version` to 3.

### Service — `src/services/agent-performance.service.ts`
- Extend types for SLA pagination, multi-state filters, per-bucket SLA counts and sample metadata; add a dev-only assertion comparing each agent row's resolved count with the case-endpoint count for the same agent/scope/filters.

### UI — `src/components/admin/agent-performance/` and `src/pages/AdminAgentPerformance.tsx`
- SLA tab: multi-select state chips, server-driven paging with a visible result count, dispute rows routed to `/admin/disputes/:id`, all filters mirrored into the URL.
- Charts: rewrite Workload vs Completion as assigned-vs-completed per bucket; split the SLA trend into compliant/at-risk/breached series with an excluded-denominator note; render Agent comparison as a multi-signal view showing "No tracked cases" instead of a 0% bar; add a calculation-info tooltip, data-source note and specific empty state to every chart.
- Metric grid: sample-size and source tooltips on all averages and rates.
- Case drawer: previous/next paging bound to backend page metadata, replacing the truncation note.
- Delete `AgentSLADrawer.tsx` and its exports.

### Verification
- Vitest coverage for range vs all-time, task/dispute dedup, orphan outcomes, missing `due_at`, zero denominators, comparison suppression, SLA pagination and Review SLA URL restoration.
- Redeploy the function, then live-check: `scope=all_time`, `range.label="All time"`, no previous-period series, and resolved counts matching across dashboard, workload rows, drawer, SLA tab and export.