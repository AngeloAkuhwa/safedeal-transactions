/**
 * Admin error log: read, group, acknowledge.
 *
 * `error_events` has RLS on with no policies, so no browser role can reach it
 * at all. That is deliberate: stack traces name internal paths and `context`
 * carries the shape of a failing request. This function is the only read path,
 * and it runs service-role behind a permission check.
 *
 * The view is grouped by fingerprint rather than listing rows, because the
 * realistic shape of the data is one defect repeating thousands of times. A
 * flat list of 4,000 identical rows is not monitoring, it is noise that hides
 * the second defect underneath it.
 *
 * Reading needs `platform_configuration.view`. Acknowledging writes to the
 * table and so needs `platform_configuration.configure`: the method decides
 * which, before anything else happens.
 */
import { requirePermission, authErrorResponse } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-correlation-id",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const WINDOWS: Record<string, number> = {
  "1h": 1,
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
};

/** Rows pulled per request. Grouping happens here rather than in SQL because
 *  the fingerprint aggregate needs a sample row and a distinct user count, and
 *  a single scan of a bounded window is cheaper than three round trips. */
const MAX_ROWS = 4_000;
/** Individual events returned when drilling into one fingerprint or one
 *  correlation id. Enough to see a pattern, not enough to ship a database. */
const MAX_DETAIL = 200;

interface ErrorRow {
  id: string;
  occurred_at: string;
  received_at: string;
  correlation_id: string | null;
  source: string;
  severity: string;
  kind: string;
  message: string;
  stack: string | null;
  route: string | null;
  function_name: string | null;
  http_status: number | null;
  user_id: string | null;
  session_id: string | null;
  release: string | null;
  user_agent: string | null;
  viewport: string | null;
  context: Record<string, unknown> | null;
  fingerprint: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
}

const SUMMARY_COLUMNS =
  "id, occurred_at, received_at, correlation_id, source, severity, kind, message, " +
  "route, function_name, http_status, user_id, session_id, release, fingerprint, " +
  "acknowledged_at, acknowledged_by";

const DETAIL_COLUMNS = `${SUMMARY_COLUMNS}, stack, user_agent, viewport, context`;

interface Group {
  fingerprint: string;
  kind: string;
  severity: string;
  source: string;
  message: string;
  route: string | null;
  function_name: string | null;
  count: number;
  first_seen: string;
  last_seen: string;
  affected_users: number;
  affected_sessions: number;
  acknowledged: boolean;
  sample_id: string;
  sample_correlation_id: string | null;
  /** Counts per hour across the window, oldest first. Drives the sparkline
   *  that separates "broke once at 3am" from "breaking continuously". */
  by_hour: number[];
}

/** Severity ordering for the group sort. A single fatal outranks a hundred
 *  warnings, because the fatal is the one that put a white page in front of
 *  someone holding money in escrow. */
const SEVERITY_RANK: Record<string, number> = { fatal: 3, error: 2, warning: 1 };

function group(rows: ErrorRow[], sinceMs: number, hours: number): Group[] {
  const buckets = new Map<string, Group>();
  const users = new Map<string, Set<string>>();
  const sessions = new Map<string, Set<string>>();

  // One bucket per hour of the window, so a 30 day view does not produce 720
  // points nobody can read. Wide windows get coarser buckets.
  const bucketCount = Math.min(48, Math.max(12, hours));
  const bucketMs = (hours * 3_600_000) / bucketCount;

  for (const row of rows) {
    let g = buckets.get(row.fingerprint);
    if (!g) {
      g = {
        fingerprint: row.fingerprint,
        kind: row.kind,
        severity: row.severity,
        source: row.source,
        message: row.message,
        route: row.route,
        function_name: row.function_name,
        count: 0,
        first_seen: row.occurred_at,
        last_seen: row.occurred_at,
        affected_users: 0,
        affected_sessions: 0,
        acknowledged: true,
        sample_id: row.id,
        sample_correlation_id: row.correlation_id,
        by_hour: new Array(bucketCount).fill(0),
      };
      buckets.set(row.fingerprint, g);
      users.set(row.fingerprint, new Set());
      sessions.set(row.fingerprint, new Set());
    }

    g.count += 1;
    if (row.occurred_at < g.first_seen) g.first_seen = row.occurred_at;
    if (row.occurred_at > g.last_seen) {
      g.last_seen = row.occurred_at;
      // Keep the newest sample: a defect's most recent occurrence is the one
      // an operator wants to open, not its first from three weeks ago.
      g.sample_id = row.id;
      g.sample_correlation_id = row.correlation_id;
      g.message = row.message;
      g.route = row.route;
      g.function_name = row.function_name;
    }
    // A group is acknowledged only when every row in it is. One new
    // occurrence after an ack reopens the group, which is the behaviour an
    // operator expects: "I looked at this" is a statement about what existed
    // when they looked.
    if (!row.acknowledged_at) g.acknowledged = false;
    if ((SEVERITY_RANK[row.severity] ?? 0) > (SEVERITY_RANK[g.severity] ?? 0)) {
      g.severity = row.severity;
    }
    if (row.user_id) users.get(row.fingerprint)!.add(row.user_id);
    if (row.session_id) sessions.get(row.fingerprint)!.add(row.session_id);

    const offset = Date.parse(row.occurred_at) - sinceMs;
    const idx = Math.floor(offset / bucketMs);
    if (idx >= 0 && idx < bucketCount) g.by_hour[idx] += 1;
  }

  for (const [fp, g] of buckets) {
    g.affected_users = users.get(fp)!.size;
    g.affected_sessions = sessions.get(fp)!.size;
  }

  return Array.from(buckets.values()).sort((a, b) => {
    if (a.acknowledged !== b.acknowledged) return a.acknowledged ? 1 : -1;
    const sev = (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0);
    if (sev) return sev;
    if (b.count !== a.count) return b.count - a.count;
    return b.last_seen.localeCompare(a.last_seen);
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Method decides the permission, and 405 is a property of the URL rather
  // than of the caller, so it may answer before identity is resolved.
  if (req.method !== "GET" && req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }
  const permission =
    req.method === "POST" ? "platform_configuration.configure" : "platform_configuration.view";

  let ctx;
  try {
    ctx = await requirePermission(req, permission);
  } catch (err) {
    const r = authErrorResponse(err, corsHeaders);
    if (r) return r;
    return json(500, { error: "auth_failed" });
  }

  const admin = ctx.adminClient;

  if (req.method === "POST") {
    const body = await req.json().catch(() => ({})) as {
      action?: string;
      fingerprint?: string;
      ids?: string[];
      before?: string;
    };

    if (body.action !== "acknowledge") {
      return json(400, { error: "unsupported_action" });
    }

    const now = new Date().toISOString();
    let query = admin
      .from("error_events")
      .update({ acknowledged_at: now, acknowledged_by: ctx.userId })
      .is("acknowledged_at", null);

    if (typeof body.fingerprint === "string" && body.fingerprint.trim()) {
      query = query.eq("fingerprint", body.fingerprint.trim());
      // Acknowledging a group acknowledges what the operator was looking at,
      // not rows that arrived while they were reading. Without this bound a
      // still-firing defect would be marked handled the instant it recurs.
      if (typeof body.before === "string" && !Number.isNaN(Date.parse(body.before))) {
        query = query.lte("occurred_at", body.before);
      }
    } else if (Array.isArray(body.ids) && body.ids.length) {
      query = query.in("id", body.ids.slice(0, 500));
    } else {
      return json(400, { error: "fingerprint_or_ids_required" });
    }

    const { error, count } = await query.select("id", { count: "exact", head: true });
    if (error) return json(500, { error: "acknowledge_failed", detail: error.message });
    return json(200, { ok: true, acknowledged: count ?? 0 });
  }

  const url = new URL(req.url);
  const windowKey = WINDOWS[url.searchParams.get("window") ?? ""] ? url.searchParams.get("window")! : "24h";
  const hours = WINDOWS[windowKey];
  const sinceMs = Date.now() - hours * 3_600_000;
  const since = new Date(sinceMs).toISOString();

  const severity = url.searchParams.get("severity");
  const source = url.searchParams.get("source");
  const fingerprint = url.searchParams.get("fingerprint");
  const correlationId = url.searchParams.get("correlation_id");
  const search = (url.searchParams.get("q") ?? "").trim();
  const unackOnly = url.searchParams.get("unacknowledged") === "1";

  // Drilling into one correlation id is the whole point of the id existing:
  // the buyer's "payment failed" and the edge stack for the same attempt,
  // returned together and ordered so cause precedes symptom. It ignores the
  // window, because the operator already knows exactly what they are asking
  // for and the trail is often older than the default 24 hours.
  if (correlationId) {
    const { data, error } = await admin
      .from("error_events")
      .select(DETAIL_COLUMNS)
      .eq("correlation_id", correlationId)
      .order("occurred_at", { ascending: true })
      .limit(MAX_DETAIL);
    if (error) return json(500, { error: "query_failed", detail: error.message });
    return json(200, { mode: "trail", correlation_id: correlationId, events: data ?? [] });
  }

  if (fingerprint) {
    let q = admin
      .from("error_events")
      .select(DETAIL_COLUMNS)
      .eq("fingerprint", fingerprint)
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(MAX_DETAIL);
    if (unackOnly) q = q.is("acknowledged_at", null);
    const { data, error } = await q;
    if (error) return json(500, { error: "query_failed", detail: error.message });
    return json(200, {
      mode: "detail",
      fingerprint,
      window: windowKey,
      events: data ?? [],
    });
  }

  let q = admin
    .from("error_events")
    .select(SUMMARY_COLUMNS)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(MAX_ROWS);

  if (severity && SEVERITY_RANK[severity]) q = q.eq("severity", severity);
  if (source === "client" || source === "edge") q = q.eq("source", source);
  if (unackOnly) q = q.is("acknowledged_at", null);
  if (search) {
    const safe = search.replace(/[%,()]/g, " ").slice(0, 120);
    q = q.or(
      `message.ilike.%${safe}%,route.ilike.%${safe}%,function_name.ilike.%${safe}%,kind.ilike.%${safe}%`,
    );
  }

  const { data, error } = await q;
  if (error) return json(500, { error: "query_failed", detail: error.message });

  const rows = (data ?? []) as ErrorRow[];
  const groups = group(rows, sinceMs, hours);

  const users = new Set<string>();
  const sessions = new Set<string>();
  const bySeverity: Record<string, number> = { fatal: 0, error: 0, warning: 0 };
  const bySource: Record<string, number> = { client: 0, edge: 0 };
  const byKind = new Map<string, number>();
  const byRoute = new Map<string, number>();
  let unacknowledged = 0;

  for (const row of rows) {
    if (row.user_id) users.add(row.user_id);
    if (row.session_id) sessions.add(row.session_id);
    bySeverity[row.severity] = (bySeverity[row.severity] ?? 0) + 1;
    bySource[row.source] = (bySource[row.source] ?? 0) + 1;
    byKind.set(row.kind, (byKind.get(row.kind) ?? 0) + 1);
    const where = row.route ?? row.function_name;
    if (where) byRoute.set(where, (byRoute.get(where) ?? 0) + 1);
    if (!row.acknowledged_at) unacknowledged += 1;
  }

  const top = (m: Map<string, number>, n: number) =>
    Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([name, count]) => ({ name, count }));

  return json(200, {
    mode: "summary",
    window: windowKey,
    since,
    summary: {
      total: rows.length,
      // MAX_ROWS is a ceiling, not a count. Saying so is the difference
      // between "217 errors today" and "at least 4,000", and an operator
      // reading the smaller number would draw the wrong conclusion.
      truncated: rows.length >= MAX_ROWS,
      groups: groups.length,
      unacknowledged,
      affected_users: users.size,
      affected_sessions: sessions.size,
      by_severity: bySeverity,
      by_source: bySource,
      top_kinds: top(byKind, 6),
      top_locations: top(byRoute, 6),
    },
    groups: groups.slice(0, 100),
  });
});
