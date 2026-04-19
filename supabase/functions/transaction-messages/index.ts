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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Not authenticated" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = authHeader.replace("Bearer ", "");
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData?.user) return jsonResponse({ error: "Invalid session" }, 401);
    const userId = userData.user.id;

    let body: Record<string, unknown> = {};
    try { body = (await req.json()) as Record<string, unknown>; }
    catch { return jsonResponse({ error: "Invalid request body" }, 400); }

    const op = String(body.op || "list");
    const transactionId = body.transaction_id as string | undefined;
    if (!transactionId) return jsonResponse({ error: "transaction_id is required" }, 400);

    // Authorize: must be a party to the transaction
    const { data: isParty, error: partyError } = await admin.rpc("is_transaction_party", {
      _user_id: userId, _transaction_id: transactionId,
    });
    if (partyError || !isParty) return jsonResponse({ error: "Not authorized" }, 403);

    if (op === "list") {
      const { data: msgs, error: listError } = await admin
        .from("transaction_messages")
        .select("id, transaction_id, sender_user_id, recipient_user_id, message_text, is_read, read_at, created_at")
        .eq("transaction_id", transactionId)
        .order("created_at", { ascending: true })
        .limit(500);

      if (listError) {
        console.error("transaction-messages list error:", listError);
        return jsonResponse({ error: "Failed to load messages" }, 500);
      }

      const userIds = [...new Set((msgs || []).flatMap((m) => [m.sender_user_id, m.recipient_user_id]))] as string[];
      const namesMap = new Map<string, { full_name: string; avatar_url: string | null }>();
      if (userIds.length > 0) {
        const { data: profiles } = await admin
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", userIds);
        for (const p of profiles || []) {
          namesMap.set(p.id as string, {
            full_name: (p.full_name as string) || "User",
            avatar_url: (p.avatar_url as string) || null,
          });
        }
      }

      const items = (msgs || []).map((m) => {
        const sender = namesMap.get(m.sender_user_id as string);
        return {
          id: m.id,
          transaction_id: m.transaction_id,
          sender_user_id: m.sender_user_id,
          recipient_user_id: m.recipient_user_id,
          message_text: m.message_text,
          is_read: m.is_read,
          read_at: m.read_at,
          created_at: m.created_at,
          sender_name: sender?.full_name || "User",
          sender_avatar_url: sender?.avatar_url || null,
          is_mine: m.sender_user_id === userId,
        };
      });

      return jsonResponse({ items, current_user_id: userId });
    }

    if (op === "mark_read") {
      const { data, error } = await admin
        .from("transaction_messages")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("transaction_id", transactionId)
        .eq("recipient_user_id", userId)
        .eq("is_read", false)
        .select("id");
      if (error) {
        console.error("transaction-messages mark_read error:", error);
        return jsonResponse({ error: "Failed to mark messages read" }, 500);
      }
      return jsonResponse({ success: true, updated_count: data?.length ?? 0 });
    }

    return jsonResponse({ error: "Unknown op" }, 400);
  } catch (err) {
    console.error("transaction-messages error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
