import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Not authenticated" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = authHeader.replace("Bearer ", "");
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return jsonResponse({ error: "Invalid session" }, 401);
    }
    const userId = userData.user.id;

    // 2. Role check
    const { data: hasRole, error: roleError } = await adminClient.rpc("has_role", {
      _user_id: userId,
      _role: "buyer",
    });
    if (roleError || !hasRole) {
      return jsonResponse({ error: "Buyer role required" }, 403);
    }

    // 3. Parse body
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "Invalid request body" }, 400);
    }

    const notificationId = body.notification_id as string | undefined;
    const markAll = body.mark_all as boolean | undefined;

    if (!notificationId && !markAll) {
      return jsonResponse({ error: "Provide notification_id or mark_all: true" }, 400);
    }

    const now = new Date().toISOString();

    // Single mark-read
    if (notificationId && !markAll) {
      const { data, error } = await adminClient
        .from("notifications")
        .update({ is_read: true, read_at: now, status: "read" })
        .eq("id", notificationId)
        .eq("user_id", userId)
        .eq("is_read", false)
        .select("id");

      if (error) {
        console.error("mark-read error:", error);
        return jsonResponse({ error: "Failed to update notification" }, 500);
      }

      if (!data || data.length === 0) {
        // Could be already read or not found/not owned
        return jsonResponse({ success: true, updated_count: 0 });
      }

      return jsonResponse({ success: true, updated_count: 1 });
    }

    // Bulk mark-all-read
    if (markAll) {
      const { data, error } = await adminClient
        .from("notifications")
        .update({ is_read: true, read_at: now, status: "read" })
        .eq("user_id", userId)
        .eq("is_read", false)
        .select("id");

      if (error) {
        console.error("mark-all-read error:", error);
        return jsonResponse({ error: "Failed to update notifications" }, 500);
      }

      return jsonResponse({ success: true, updated_count: data?.length ?? 0 });
    }

    return jsonResponse({ error: "Invalid request" }, 400);
  } catch (err) {
    console.error("buyer-notifications-read error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
