## Fix: Task Orchestration edge functions are not deployed

The page shows "Failed to send a request to the Edge Function" because both `admin-task-orchestration-overview` and `admin-task-orchestration-action` return **HTTP 404 "Requested function was not found"** — they exist as files under `supabase/functions/` but were never picked up for deployment (no logs recorded at all).

### Steps
1. Force redeploy of both functions by touching their `index.ts` (e.g. add a version comment header) so the Lovable deploy pipeline registers and boots them.
2. Also pin the Supabase JS import in the overview function to `npm:@supabase/supabase-js@2` (matches the pattern used by other working functions and avoids esm.sh boot-time issues that can silently fail deploys).
3. Curl both endpoints after redeploy to confirm they respond (200/401 instead of 404), then reload the page.
4. If either still 404s after redeploy, tail `supabase--edge_function_logs` for the specific boot error and fix in place.

### Technical notes
- DB tables (`orchestration_tasks`, `assignment_rules`, `agent_capacity`, etc.) and permissions (`task_orchestration.view/assign/reassign/configure`) already exist — no migration needed.
- Client service and UI are already wired; only the two edge functions need to come online.
