# All-time scope: the screen is talking to a stale backend

## What the screenshots show

With `?scope=all_time` in the URL and the "All time" pill selected:

- The header still reads `Range: Last 7 Days`, the third KPI still reads `Resolved · Last 7 Days`, and every number is identical to the "In range" view.
- The Assigned cases drawer still says `RESOLVED (3) · SELECTED RANGE` in both states.

## The diagnosis

The frontend is wired correctly: the toggle sets `filters.scope`, the page mirrors it into the URL, and both `fetchAgentPerformance` and `fetchAgentCases` put `scope` in the request body. The edge function source also handles it — `resolveRange()` returns `{ label: "All time", allTime: true }` when `scope === "all_time"`, and both responses include a `range` block.

The tell is the drawer wording. `"Selected range"` does not exist anywhere in the edge function; it is only the client-side fallback used when the response has **no `range` field at all**:

```ts
range: res?.range ?? { key: "7d", label: "Selected range" }
```

So the running `admin-agent-performance` function is an older build that predates the scope/`range` work. Every number and label the page renders is coming from that stale deployment, which is why "All time" changes nothing.

## The fix

1. Redeploy `supabase/functions/admin-agent-performance` so the running version matches the source (scope handling, `range` block, all-time trend start, suppressed deltas).
2. Verify after deploy: with scope `all_time` the header must read `Range: All time`, the resolved KPI must read `Resolved · All time`, deltas must show "No comparison"/"All-time roster", and the drawer heading must read `RESOLVED (n) · All time`.
3. Add two small guards so a version skew can never silently look like a working filter again:
   - `fetchAgentCases` falls back to a label derived from the requested scope (`All time` vs the range label) instead of the generic `"Selected range"`.
   - The page shows a one-line warning when the response `range.all_time` disagrees with the requested scope, so a stale function is visible rather than confusing.

## Technical notes

- No schema or SQL changes; this is a deploy plus two defensive client tweaks.
- Files touched: `supabase/functions/admin-agent-performance/index.ts` (redeploy only, no logic change expected), `src/services/agent-performance.service.ts`, `src/pages/AdminAgentPerformance.tsx`.
