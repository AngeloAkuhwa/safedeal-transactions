import { createClient } from "npm:@supabase/supabase-js@2.49.1";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function verifyCronSecret(req: Request): { ok: true } | { ok: false; res: Response } {
  const got = req.headers.get("x-cron-secret");
  const want = Deno.env.get("CRON_SECRET");
  if (!want) return { ok: false, res: jsonResponse({ error: "CRON_SECRET not configured" }, 500) };
  if (!got || got !== want) return { ok: false, res: jsonResponse({ error: "Unauthorized" }, 401) };
  return { ok: true };
}

export function admin() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

export async function logRun(
  client: ReturnType<typeof admin>,
  service: string,
  metadata: Record<string, unknown>,
  level: "info" | "warn" | "error" = "info",
  message?: string,
) {
  await client.from("system_logs").insert({
    level,
    service_name: service,
    message: message ?? `${service} run complete`,
    metadata,
  });
}
