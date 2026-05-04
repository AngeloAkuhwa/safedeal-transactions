import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return jsonResp({ error: "Not authenticated" }, 401);

    const url = new URL(req.url);
    const winRaw = (url.searchParams.get("window") || "7D").toUpperCase();
    const win = winRaw === "30D" ? "30D" : winRaw === "90D" ? "90D" : "7D";
    const days = win === "7D" ? 7 : win === "30D" ? 30 : 90;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const client = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userErr } = await client.auth.getUser(
      auth.replace("Bearer ", ""),
    );
    if (userErr || !userData?.user) return jsonResp({ error: "Invalid session" }, 401);

    const { data: hasRole, error: roleErr } = await client.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (roleErr || !hasRole) return jsonResp({ error: "Admin role required" }, 403);

    const now = new Date();
    const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const sinceIso = new Date(today0 - (days - 1) * 86_400_000).toISOString();

    const [{ data: tx }, { data: dp }] = await Promise.all([
      client.from("transactions").select("created_at").gte("created_at", sinceIso).limit(50000),
      client.from("disputes").select("created_at").gte("created_at", sinceIso).limit(50000),
    ]);

    const map = new Map<string, { date: string; primary: number; secondary: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today0 - i * 86_400_000);
      const date = d.toISOString().slice(0, 10);
      map.set(date, { date, primary: 0, secondary: 0 });
    }
    const bucket = (d: Date) => {
      const key = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10);
      return map.get(key);
    };
    for (const r of (tx ?? []) as any[]) {
      const b = bucket(new Date(r.created_at));
      if (b) b.primary++;
    }
    for (const r of (dp ?? []) as any[]) {
      const b = bucket(new Date(r.created_at));
      if (b) b.secondary++;
    }

    const points = Array.from(map.values()).map((p) => ({
      label: p.date.slice(5), // MM-DD
      date: p.date,
      primary: p.primary,
      secondary: p.secondary,
    }));

    return jsonResp({
      primary_label: "Transactions",
      secondary_label: "Disputes",
      points,
    });
  } catch (e) {
    return jsonResp({ error: `Unexpected error: ${(e as Error).message}` }, 500);
  }
});