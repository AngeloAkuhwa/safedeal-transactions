// Presence heartbeat for internal users. Upserts agent_availability so
// signed-in admins/agents appear online in the Task Orchestration roster.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userRes } = await admin.auth.getUser(jwt);
    const userId = userRes?.user?.id;
    if (!userId) return json({ error: "unauthorized" }, 401);

    const { data: isInternal } = await admin.rpc("is_internal_admin", { _user_id: userId });
    if (!isInternal) return json({ error: "forbidden" }, 403);

    let requested: string | null = null;
    try {
      const body = await req.json();
      if (body?.status && ["available","busy","offline"].includes(body.status)) requested = body.status;
    } catch { /* body optional */ }

    // If no explicit status, mark available on heartbeat. Explicit "offline"
    // is respected so users can go dark manually.
    const status = requested ?? "available";

    const { error } = await admin
      .from("agent_availability")
      .upsert({ user_id: userId, status, last_heartbeat: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) return json({ error: error.message }, 500);

    return json({ ok: true, status });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}