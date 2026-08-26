import { supabase } from "@/integrations/supabase/client";

/**
 * Client for the error log. Mirrors `supabase/functions/admin-error-events`.
 *
 * The table itself is unreachable from the browser (RLS on, no policies), so
 * everything here goes through the edge function. That is the point: stack
 * traces name internal paths, and a browser that can read the errors it
 * produced can read everyone else's too.
 */

export type ErrorSeverity = "warning" | "error" | "fatal";
export type ErrorSourceKind = "client" | "edge";

export interface ErrorEvent {
  id: string;
  occurred_at: string;
  received_at: string;
  correlation_id: string | null;
  source: ErrorSourceKind;
  severity: ErrorSeverity;
  kind: string;
  message: string;
  stack?: string | null;
  route: string | null;
  function_name: string | null;
  http_status: number | null;
  user_id: string | null;
  session_id: string | null;
  release: string | null;
  user_agent?: string | null;
  viewport?: string | null;
  context?: Record<string, unknown> | null;
  fingerprint: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
}

export interface ErrorGroup {
  fingerprint: string;
  kind: string;
  severity: ErrorSeverity;
  source: ErrorSourceKind;
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
  by_hour: number[];
}

export interface ErrorSummary {
  total: number;
  /** The query hit its row ceiling, so `total` is a floor rather than a count.
   *  Surfaced in the UI: "217 errors" and "at least 4,000" read differently. */
  truncated: boolean;
  groups: number;
  unacknowledged: number;
  affected_users: number;
  affected_sessions: number;
  by_severity: Record<string, number>;
  by_source: Record<string, number>;
  top_kinds: { name: string; count: number }[];
  top_locations: { name: string; count: number }[];
}

export interface ErrorSummaryResponse {
  mode: "summary";
  window: string;
  since: string;
  summary: ErrorSummary;
  groups: ErrorGroup[];
}

export interface ErrorDetailResponse {
  mode: "detail";
  fingerprint: string;
  window: string;
  events: ErrorEvent[];
}

export interface ErrorTrailResponse {
  mode: "trail";
  correlation_id: string;
  events: ErrorEvent[];
}

export type ErrorWindow = "1h" | "24h" | "7d" | "30d";

export interface ErrorQuery {
  window?: ErrorWindow;
  severity?: ErrorSeverity | "all";
  source?: ErrorSourceKind | "all";
  q?: string;
  unacknowledged?: boolean;
  fingerprint?: string;
  correlationId?: string;
}

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${session.access_token}` };
}

function queryString(query: ErrorQuery): string {
  const params = new URLSearchParams();
  if (query.window) params.set("window", query.window);
  if (query.severity && query.severity !== "all") params.set("severity", query.severity);
  if (query.source && query.source !== "all") params.set("source", query.source);
  if (query.q) params.set("q", query.q);
  if (query.unacknowledged) params.set("unacknowledged", "1");
  if (query.fingerprint) params.set("fingerprint", query.fingerprint);
  if (query.correlationId) params.set("correlation_id", query.correlationId);
  const s = params.toString();
  return s ? `?${s}` : "";
}

async function get<T>(query: ErrorQuery): Promise<T> {
  const headers = await authHeader();
  const { data, error } = await supabase.functions.invoke(
    `admin-error-events${queryString(query)}`,
    { method: "GET", headers },
  );
  if (error) throw new Error(error.message || "Failed to load the error log");
  if (!data || (data as { error?: string }).error) {
    throw new Error((data as { error?: string })?.error || "Failed to load the error log");
  }
  return data as T;
}

export function fetchErrorSummary(query: ErrorQuery): Promise<ErrorSummaryResponse> {
  return get<ErrorSummaryResponse>(query);
}

export function fetchErrorDetail(
  fingerprint: string,
  window: ErrorWindow,
): Promise<ErrorDetailResponse> {
  return get<ErrorDetailResponse>({ fingerprint, window });
}

/** Every row sharing one correlation id, oldest first, so an edge cause reads
 *  above the client symptom it produced. */
export function fetchErrorTrail(correlationId: string): Promise<ErrorTrailResponse> {
  return get<ErrorTrailResponse>({ correlationId });
}

/**
 * Mark a group handled up to the moment the operator was looking at.
 *
 * `before` is not optional in practice: without it, a defect still firing
 * would be marked handled the instant it recurs, and the group would go quiet
 * while the thing it describes keeps happening.
 */
export async function acknowledgeErrorGroup(
  fingerprint: string,
  before: string,
): Promise<{ acknowledged: number }> {
  const headers = await authHeader();
  const { data, error } = await supabase.functions.invoke("admin-error-events", {
    headers,
    body: { action: "acknowledge", fingerprint, before },
  });
  if (error) throw new Error(error.message || "Could not acknowledge");
  if (!data || (data as { error?: string }).error) {
    throw new Error((data as { error?: string })?.error || "Could not acknowledge");
  }
  return data as { acknowledged: number };
}
