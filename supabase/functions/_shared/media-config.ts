// Resolves the platform media standards from `system_settings`.
// Mirrors the pricing/commerce config resolver pattern.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { FALLBACK_MEDIA_CONFIG, MediaConfig, parseMediaConfig } from "./media-rules.ts";

export const MEDIA_KEYS = [
  "media.image_min_dimension_px",
  "media.image_recommended_min_px",
  "media.image_allowed_ratios",
  "media.image_auto_normalise_ratio",
  "media.image_max_bytes",
  "media.image_allowed_formats",
  "media.product_min_images_to_publish",
  "media.product_max_images",
  "media.product_max_videos",
  "media.video_allowed_formats",
  "media.video_min_height_px",
  "media.video_max_seconds",
  "media.video_max_bytes",
  "media.video_allowed_ratios",
  "media.quality_advisories_enabled",
  "media.server_verification_enabled",
  "media.grandfather_before",
];

export async function loadMediaConfig(): Promise<MediaConfig> {
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data } = await admin
      .from("system_settings")
      .select("setting_key, setting_value")
      .eq("scope", "platform")
      .in("setting_key", MEDIA_KEYS);
    const raw: Record<string, unknown> = {};
    (data ?? []).forEach((r: any) => { raw[r.setting_key] = r.setting_value; });
    return parseMediaConfig(raw);
  } catch (_e) {
    return FALLBACK_MEDIA_CONFIG;
  }
}