import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { loadMediaConfig } from "../_shared/media-config.ts";
import {
  applyTransformation,
  MediaConfig,
  normalisationTransformation,
  validateImage,
  validateVideo,
} from "../_shared/media-rules.ts";

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
        return await signUpload(admin, userId, body);
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
/**
 * Incoming transformation for product photo masters: never store more than
 * 2000px on the longest side, at a sane quality. Pure URL/transform work —
 * no paid Cloudinary add-ons involved.
 */
const MASTER_INCOMING_TRANSFORMATION = "c_limit,w_2000,h_2000,q_auto:good";

async function signUpload(
  admin: ReturnType<typeof createClient>,
  userId: string,
  body: { context?: string; resource_type?: string },
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

  const contextMap: Record<string, string> = {
    product_evidence: "products",
    product_media: "products",
    delivery_proof: "delivery",
  };
  const context = contextMap[body.context] ?? "disputes";
  const folder = `SafeDeal/${context}/${userId}`;
  const timestamp = Math.floor(Date.now() / 1000);

  const params: Record<string, string> = {
    folder,
    timestamp: String(timestamp),
  };

  // Product media: constrain the signed upload at Cloudinary's edge too, so an
  // oversized or wrong-format file is rejected before it ever reaches us.
  const isProduct = body.context === "product_evidence" || body.context === "product_media";
  let mediaCfg: MediaConfig | null = null;
  if (isProduct) {
    mediaCfg = await loadMediaConfig();
    params.allowed_formats = [
      ...mediaCfg.imageAllowedFormats.flatMap((f) => (f === "jpeg" ? ["jpg", "jpeg"] : [f])),
      ...mediaCfg.videoAllowedFormats,
    ].join(",");
    params.max_file_size = String(Math.max(mediaCfg.imageMaxBytes, mediaCfg.videoMaxBytes));
    // Only images get the incoming transformation; videos would need eager
    // processing, which we deliberately avoid.
    if ((body.resource_type ?? "image") === "image") {
      params.transformation = MASTER_INCOMING_TRANSFORMATION;
    }
  }

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
    allowed_formats: params.allowed_formats ?? null,
    max_file_size: params.max_file_size ?? null,
    transformation: params.transformation ?? null,
    media_config: mediaCfg,
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
    context_type?: string;
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
  const allowedFormats = ["jpg", "jpeg", "png", "webp", "mp4", "mov", "webm", "pdf"];
  if (!allowedFormats.includes(format.toLowerCase())) {
    return jsonResponse({ error: `File format '${format}' is not allowed. Allowed: ${allowedFormats.join(", ")}` }, 400);
  }

  // Cross-validate resource_type vs format
  const validCombinations: Record<string, string[]> = {
    image: ["jpg", "jpeg", "png", "webp", "pdf"],
    video: ["mp4", "mov", "webm"],
    raw: ["pdf"],
  };
  const allowedForResource = validCombinations[resource_type];
  if (!allowedForResource || !allowedForResource.includes(format.toLowerCase())) {
    return jsonResponse({ error: `resource_type '${resource_type}' does not match format '${format}'` }, 400);
  }

  // Validate size (50MB for video, 10MB for others)
  const isVideo = resource_type === "video";
  const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
  if (bytes > maxSize) {
    return jsonResponse({ error: `File exceeds ${isVideo ? "50MB" : "10MB"} limit` }, 400);
  }

  // ══════════════════════════════════════════════════════════
  // AUTHORITATIVE MEDIA VERIFICATION (product media only)
  //
  // Everything above trusts the client. From here we re-read the asset
  // from Cloudinary's Admin API and validate the REAL bytes/width/height/
  // duration against the configured media standards. A direct API call
  // that understates `bytes` or lies about dimensions cannot get past this.
  // ══════════════════════════════════════════════════════════
  const isProductMedia = body.context_type === "product_evidence" || body.context_type === "product_media";
  let verified: CloudinaryResource | null = null;
  let normalisedTransformation: string | null = null;
  let mediaCfg: MediaConfig | null = null;

  if (isProductMedia) {
    mediaCfg = await loadMediaConfig();
    if (mediaCfg.serverVerificationEnabled) {
      const lookup = await fetchCloudinaryResource(resource_type, public_id);
      if (lookup.kind === "unavailable") {
        // Fail closed, but tell the seller it is retry-able. Never a silent loss.
        return jsonResponse({
          error: "We couldn't verify this upload just now. Please tap retry. Your file was not lost.",
          code: "verification_unavailable",
          retryable: true,
        }, 503);
      }
      if (lookup.kind === "missing") {
        return jsonResponse({ error: "Upload not found at the media provider.", code: "asset_missing" }, 400);
      }
      verified = lookup.resource;

      const realFormat = String(verified.format ?? format).toLowerCase();
      const realBytes = Number(verified.bytes ?? bytes);

      const result = verified.resource_type === "video"
        ? validateVideo({
            width: Number(verified.width ?? 0),
            height: Number(verified.height ?? 0),
            bytes: realBytes,
            format: realFormat,
            durationSeconds: Number(verified.duration ?? 0),
          }, mediaCfg)
        : validateImage({
            width: Number(verified.width ?? 0),
            height: Number(verified.height ?? 0),
            bytes: realBytes,
            format: realFormat,
          }, mediaCfg);

      if (!result.ok) {
        // Reject: delete the asset so we never hold media we refused.
        await destroyCloudinaryAsset(resource_type, public_id);
        return jsonResponse({
          error: result.errors.map((e) => e.message).join(" "),
          code: "media_rejected",
          issues: result.errors,
        }, 400);
      }
      if (result.normalise) {
        normalisedTransformation = result.normalise.transformation;
      }
    }
  }

  // Map Cloudinary resource_type to our enum
  const resourceTypeMap: Record<string, string> = {
    image: "image",
    video: "video",
    raw: "raw",
  };
  let mappedResourceType = resourceTypeMap[resource_type] || "raw";
  if (format.toLowerCase() === "pdf") {
    mappedResourceType = "raw";
  }

  // Map format to mime type
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    pdf: "application/pdf",
  };
  const mimeType = mimeMap[format.toLowerCase()] || "application/octet-stream";

  // Build optimized file_url
  const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME")!.trim();
  let fileUrl = `https://res.cloudinary.com/${cloudName}/${resource_type}/upload/q_auto,f_auto/${public_id}`;
  let storedSecureUrl = secure_url;
  if (normalisedTransformation) {
    // The STORED asset is the normalised (white-padded) derivative, so the
    // catalogue grid stays consistent. The original stays retrievable in
    // Cloudinary at the untransformed public_id.
    fileUrl = `https://res.cloudinary.com/${cloudName}/${resource_type}/upload/${normalisedTransformation}/${public_id}`;
    storedSecureUrl = applyTransformation(secure_url, normalisedTransformation);
  }

  // Insert file record using service role (bypasses RLS)
  const { data: file, error: insertErr } = await admin
    .from("files")
    .insert({
      provider: "cloudinary",
      provider_asset_id: asset_id,
      resource_type: mappedResourceType,
      file_url: fileUrl,
      secure_url: storedSecureUrl,
      original_file_name: original_filename || null,
      mime_type: mimeType,
      file_size_bytes: bytes,
      uploaded_by_user_id: userId,
      context_type: (body.context_type === "product_evidence" || body.context_type === "product_media") ? "transaction_media" : body.context_type === "delivery_proof" ? "delivery_proof" : "dispute_evidence",
      is_temporary: true,
      retention_category: (body.context_type === "product_evidence" || body.context_type === "product_media") ? "transaction_media" : body.context_type === "delivery_proof" ? "delivery_proof" : "dispute_evidence",
      file_hash: file_hash,
      hash_algorithm: hash_algorithm,
      metadata_json: {
        public_id,
        width: verified?.width ?? null,
        height: verified?.height ?? null,
        duration_seconds: verified?.duration ?? null,
        verified_bytes: verified?.bytes ?? null,
        server_verified: Boolean(verified),
        normalised_transformation: normalisedTransformation,
      },
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
    secure_url: storedSecureUrl,
    original_secure_url: secure_url,
    normalised: Boolean(normalisedTransformation),
    normalised_transformation: normalisedTransformation,
    width: verified?.width ?? null,
    height: verified?.height ?? null,
    mime_type: mimeType,
    original_file_name: original_filename || null,
    fingerprint,
  });
}

// ════════════════════════════════════════════
// CLOUDINARY ADMIN API
//
// Rate limit: the Admin API allows 500 requests/hour on the free tier and
// 2,000/hour on paid plans. We spend exactly ONE call per registered product
// file (not per byte, not per view), so 500/hr equals 500 product images per
// hour platform-wide: comfortably above our per-seller cap of 50 uploads/hr.
// If we ever approach it, `media.server_verification_enabled` degrades us to
// client-reported metadata without a deploy. On 429 / timeout we fail CLOSED
// with a retry-able 503 rather than admitting unverified media.
// ════════════════════════════════════════════
interface CloudinaryResource {
  format?: string;
  bytes?: number;
  width?: number;
  height?: number;
  duration?: number;
  resource_type?: string;
}

type ResourceLookup =
  | { kind: "ok"; resource: CloudinaryResource }
  | { kind: "missing" }
  | { kind: "unavailable" };

function cloudinaryAuthHeader(): string {
  const apiKey = Deno.env.get("CLOUDINARY_API_KEY")!.trim();
  const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET")!.trim();
  return `Basic ${btoa(`${apiKey}:${apiSecret}`)}`;
}

async function fetchCloudinaryResource(
  resourceType: string,
  publicId: string,
): Promise<ResourceLookup> {
  const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME")!.trim();
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/resources/${resourceType}/upload/${encodeURIComponent(publicId)}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: cloudinaryAuthHeader() },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) return { kind: "missing" };
    if (!res.ok) {
      console.error("Cloudinary admin lookup failed:", res.status);
      return { kind: "unavailable" };
    }
    return { kind: "ok", resource: await res.json() };
  } catch (err) {
    console.error("Cloudinary admin lookup error:", err);
    return { kind: "unavailable" };
  }
}

async function destroyCloudinaryAsset(resourceType: string, publicId: string): Promise<void> {
  const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME")!.trim();
  const apiKey = Deno.env.get("CLOUDINARY_API_KEY")!.trim();
  const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET")!.trim();
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await cloudinarySignature(apiSecret, `public_id=${publicId}&timestamp=${timestamp}`);
  const form = new FormData();
  form.append("public_id", publicId);
  form.append("timestamp", String(timestamp));
  form.append("api_key", apiKey);
  form.append("signature", signature);
  try {
    await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error("Cloudinary destroy failed:", err);
  }
}
