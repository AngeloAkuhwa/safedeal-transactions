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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const userId = user.id;

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "sign_upload":
        return await signUpload(admin, userId);
      case "register_file":
        return await registerFile(admin, userId, body);
      default:
        return jsonResponse({ error: "Unknown action" }, 400);
    }
  } catch (err) {
    console.error("upload-evidence error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

// ════════════════════════════════════════════
// SIGN UPLOAD
// ════════════════════════════════════════════
async function signUpload(
  admin: ReturnType<typeof createClient>,
  userId: string,
) {
  // Rate limit: max 50 uploads per hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countErr } = await admin
    .from("files")
    .select("id", { count: "exact", head: true })
    .eq("uploaded_by_user_id", userId)
    .gte("created_at", oneHourAgo);

  if (countErr) {
    console.error("Rate limit check failed:", countErr);
    return jsonResponse({ error: "Rate limit check failed" }, 500);
  }

  if ((count ?? 0) >= 50) {
    return jsonResponse({ error: "Upload rate limit exceeded (50/hr)" }, 429);
  }

  const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME")!.trim();
  const apiKey = Deno.env.get("CLOUDINARY_API_KEY")!.trim();
  const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET")!.trim();

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `SafeDeal/disputes/${userId}`;

  const params: Record<string, string> = {
    folder,
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
  });
}

// ════════════════════════════════════════════
// REGISTER FILE
// ════════════════════════════════════════════
async function registerFile(
  admin: ReturnType<typeof createClient>,
  userId: string,
  body: {
    public_id?: string;
    asset_id?: string;
    secure_url?: string;
    bytes?: number;
    format?: string;
    resource_type?: string;
    original_filename?: string;
    file_hash?: string;
    hash_algorithm?: string;
  },
) {
  const {
    public_id,
    asset_id,
    secure_url,
    bytes,
    format,
    resource_type,
    original_filename,
    file_hash,
    hash_algorithm = "sha256",
  } = body;

  // Validate required fields
  if (!public_id || !asset_id || !secure_url || !bytes || !format || !resource_type) {
    return jsonResponse({ error: "Missing required Cloudinary response fields" }, 400);
  }

  if (!file_hash) {
    return jsonResponse({ error: "file_hash is required" }, 400);
  }

  // Validate format
  const allowedFormats = ["jpg", "jpeg", "png", "mp4", "pdf"];
  if (!allowedFormats.includes(format.toLowerCase())) {
    return jsonResponse({ error: `File format '${format}' is not allowed. Allowed: ${allowedFormats.join(", ")}` }, 400);
  }

  // Cross-validate resource_type vs format
  const validCombinations: Record<string, string[]> = {
    image: ["jpg", "jpeg", "png", "pdf"],
    video: ["mp4"],
    raw: ["pdf"],
  };
  const allowedForResource = validCombinations[resource_type];
  if (!allowedForResource || !allowedForResource.includes(format.toLowerCase())) {
    return jsonResponse({ error: `resource_type '${resource_type}' does not match format '${format}'` }, 400);
  }

  // Validate size (10MB)
  const maxSize = 10 * 1024 * 1024;
  if (bytes > maxSize) {
    return jsonResponse({ error: "File exceeds 10MB limit" }, 400);
  }

  // Map Cloudinary resource_type to our enum
  const resourceTypeMap: Record<string, string> = {
    image: "image",
    video: "video",
    raw: "raw",
  };
  const mappedResourceType = resourceTypeMap[resource_type] || "raw";

  // Map format to mime type
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    mp4: "video/mp4",
    pdf: "application/pdf",
  };
  const mimeType = mimeMap[format.toLowerCase()] || "application/octet-stream";

  // Build optimized file_url
  const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME")!;
  const fileUrl = `https://res.cloudinary.com/${cloudName}/${resource_type}/upload/q_auto,f_auto/${public_id}`;

  // Insert file record using service role (bypasses RLS)
  const { data: file, error: insertErr } = await admin
    .from("files")
    .insert({
      provider: "cloudinary",
      provider_asset_id: asset_id,
      resource_type: mappedResourceType,
      file_url: fileUrl,
      secure_url: secure_url,
      original_file_name: original_filename || null,
      mime_type: mimeType,
      file_size_bytes: bytes,
      uploaded_by_user_id: userId,
      context_type: "dispute_evidence",
      is_temporary: true,
      retention_category: "dispute_evidence",
      file_hash: file_hash,
      hash_algorithm: hash_algorithm,
      metadata_json: { public_id },
    })
    .select("id")
    .single();

  if (insertErr || !file) {
    console.error("Failed to register file:", insertErr);
    return jsonResponse({ error: "Failed to register file" }, 500);
  }

  // Format fingerprint from hash (first 8 chars as #XXXX-XXXX)
  const fingerprint = `#${file_hash.substring(0, 4).toUpperCase()}-${file_hash.substring(4, 8).toUpperCase()}`;

  return jsonResponse({
    file_id: file.id,
    secure_url,
    mime_type: mimeType,
    original_file_name: original_filename || null,
    fingerprint,
  });
}
