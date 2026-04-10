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

async function cloudinarySignature(apiSecret: string, paramsToSign: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(paramsToSign + apiSecret);
  const digest = await crypto.subtle.digest("SHA-1", data);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = authHeader.replace("Bearer ", "");
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "Invalid session" }, 401);
    }
    const userId = userData.user.id;

    const body = await req.json();
    const { action } = body;

    if (action === "sign_upload") {
      const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME")!.trim();
      const apiKey = Deno.env.get("CLOUDINARY_API_KEY")!.trim();
      const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET")!.trim();

      const folder = `SafeDeal/avatars/${userId}`;
      const timestamp = Math.floor(Date.now() / 1000);

      const params: Record<string, string> = {
        folder,
        overwrite: "true",
        public_id: "avatar",
        timestamp: String(timestamp),
      };

      const paramsToSign = Object.keys(params)
        .sort()
        .map((k) => `${k}=${params[k]}`)
        .join("&");

      const signature = await cloudinarySignature(apiSecret, paramsToSign);

      return jsonResponse({
        timestamp,
        signature,
        api_key: apiKey,
        cloud_name: cloudName,
        folder,
        public_id: `${folder}/avatar`,
      });
    }

    if (action === "save_avatar") {
      const { secure_url, public_id } = body;
      if (!secure_url || !public_id) {
        return jsonResponse({ error: "Missing secure_url or public_id" }, 400);
      }

      const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME")!.trim();
      const avatarUrl = `https://res.cloudinary.com/${cloudName}/image/upload/w_400,h_400,c_fill,q_auto,f_auto/${public_id}`;

      const { error: updateErr } = await admin
        .from("profiles")
        .update({ avatar_url: avatarUrl })
        .eq("id", userId);

      if (updateErr) {
        console.error("Failed to update avatar_url:", updateErr);
        return jsonResponse({ error: "Failed to save avatar" }, 500);
      }

      return jsonResponse({ success: true, avatar_url: avatarUrl });
    }

    if (action === "remove_avatar") {
      const { error: updateErr } = await admin
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", userId);

      if (updateErr) {
        return jsonResponse({ error: "Failed to remove avatar" }, 500);
      }

      return jsonResponse({ success: true, avatar_url: null });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("upload-avatar error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
