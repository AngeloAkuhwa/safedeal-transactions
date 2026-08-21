/**
 * Per-admin sliding-window rate limiter, backed by the
 * `public.check_admin_rate_limit(admin_id, action_key, cap)` RPC.
 *
 * Usage:
 *   const gate = await enforceAdminRateLimit(ctx, "reveal_user_field", 20);
 *   if (gate) return gate;   // 429 response, already CORS-wrapped
 *
 * The REAL ceiling lives in the `security.admin_rate_limit_caps` platform
 * setting and is resolved inside the RPC. The `maxPerHour` argument below is
 * a caller-side hint that can only LOWER the configured cap. A limiter the
 * caller can raise is not a limiter. The RPC also verifies that the subject
 * is active internal staff and is executable by `service_role` only.
 *
 * Fails CLOSED on internal read errors: money- and privilege-bearing
 * endpoints must never lose their throttle because of a database blip.
 */
import type { AuthContext } from "./auth.ts";

function limiterUnavailable(corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      error: "rate_limit_unavailable",
      reason: "Rate limiting is temporarily unavailable. Please retry shortly.",
      retry_after_seconds: 30,
    }),
    {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "30" },
    },
  );
}

export async function enforceAdminRateLimit(
  ctx: AuthContext,
  actionKey: string,
  maxPerHour: number,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  try {
    const { data, error } = await ctx.adminClient.rpc("check_admin_rate_limit", {
      _admin_id: ctx.userId,
      _action_key: actionKey,
      _max_per_hour: maxPerHour,
    });
    if (error) {
      console.error("[rate-limit] rpc error", actionKey, error);
      return limiterUnavailable(corsHeaders);
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row && row.allowed === false) {
      return new Response(
        JSON.stringify({
          error: "rate_limited",
          reason: `You have hit the hourly cap for this action (${row.cap}/hr). Try again shortly.`,
          used: row.used,
          cap: row.cap,
          retry_after_seconds: 3600,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": "3600",
          },
        },
      );
    }
    return null;
  } catch (e) {
    console.error("[rate-limit] threw", actionKey, (e as Error).message);
    return limiterUnavailable(corsHeaders);
  }
}