/**
 * Product media rules: single source of truth for what a seller may upload.
 *
 * Every threshold is config-driven from `system_settings` (`media.*` keys).
 * This module is PURE: it validates already-extracted metadata so the exact
 * same code path can run in the browser (immediate feedback) and in the
 * `upload-evidence` edge function (authoritative).
 *
 * Keep in lock-step with `supabase/functions/_shared/media-rules.ts`.
 */

export interface MediaConfig {
  imageMinDimensionPx: number;
  imageRecommendedMinPx: number;
  imageAllowedRatios: string[];
  imageAutoNormaliseRatio: boolean;
  imageMaxBytes: number;
  imageAllowedFormats: string[];
  productMinImagesToPublish: number;
  productMaxImages: number;
  productMaxVideos: number;
  videoAllowedFormats: string[];
  videoMinHeightPx: number;
  videoMaxSeconds: number;
  videoMaxBytes: number;
  videoAllowedRatios: string[];
  qualityAdvisoriesEnabled: boolean;
  serverVerificationEnabled: boolean;
  grandfatherBefore: string | null;
}

/** Used only when the config endpoint is unreachable. Mirrors the DB defaults. */
export const FALLBACK_MEDIA_CONFIG: MediaConfig = {
  imageMinDimensionPx: 800,
  imageRecommendedMinPx: 1600,
  imageAllowedRatios: ["1:1", "3:4", "4:5"],
  imageAutoNormaliseRatio: true,
  imageMaxBytes: 3_145_728,
  imageAllowedFormats: ["jpeg", "png", "webp"],
  productMinImagesToPublish: 3,
  productMaxImages: 10,
  productMaxVideos: 1,
  videoAllowedFormats: ["mp4", "webm"],
  videoMinHeightPx: 720,
  videoMaxSeconds: 60,
  videoMaxBytes: 52_428_800,
  videoAllowedRatios: ["1:1", "4:5", "9:16", "16:9"],
  qualityAdvisoriesEnabled: true,
  serverVerificationEnabled: true,
  grandfatherBefore: null,
};

const num = (v: unknown, d: number) => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : d;
};
const bool = (v: unknown, d: boolean) => (v == null ? d : Boolean(v));
const list = (v: unknown, d: string[]) =>
  Array.isArray(v) && v.length > 0 ? v.map((x) => String(x)) : d;

/** Build a MediaConfig from a raw `setting_key -> setting_value` map. */
export function parseMediaConfig(raw: Record<string, unknown> | null | undefined): MediaConfig {
  const m = raw ?? {};
  const f = FALLBACK_MEDIA_CONFIG;
  return {
    imageMinDimensionPx: num(m["media.image_min_dimension_px"], f.imageMinDimensionPx),
    imageRecommendedMinPx: num(m["media.image_recommended_min_px"], f.imageRecommendedMinPx),
    imageAllowedRatios: list(m["media.image_allowed_ratios"], f.imageAllowedRatios),
    imageAutoNormaliseRatio: bool(m["media.image_auto_normalise_ratio"], f.imageAutoNormaliseRatio),
    imageMaxBytes: num(m["media.image_max_bytes"], f.imageMaxBytes),
    imageAllowedFormats: list(m["media.image_allowed_formats"], f.imageAllowedFormats),
    productMinImagesToPublish: num(m["media.product_min_images_to_publish"], f.productMinImagesToPublish),
    productMaxImages: num(m["media.product_max_images"], f.productMaxImages),
    productMaxVideos: num(m["media.product_max_videos"], f.productMaxVideos),
    videoAllowedFormats: list(m["media.video_allowed_formats"], f.videoAllowedFormats),
    videoMinHeightPx: num(m["media.video_min_height_px"], f.videoMinHeightPx),
    videoMaxSeconds: num(m["media.video_max_seconds"], f.videoMaxSeconds),
    videoMaxBytes: num(m["media.video_max_bytes"], f.videoMaxBytes),
    videoAllowedRatios: list(m["media.video_allowed_ratios"], f.videoAllowedRatios),
    qualityAdvisoriesEnabled: bool(m["media.quality_advisories_enabled"], f.qualityAdvisoriesEnabled),
    serverVerificationEnabled: bool(m["media.server_verification_enabled"], f.serverVerificationEnabled),
    grandfatherBefore: typeof m["media.grandfather_before"] === "string"
      ? String(m["media.grandfather_before"])
      : f.grandfatherBefore,
  };
}

// ── Ratio helpers ──────────────────────────────────────────────

/** Human-readable megabyte label for a byte ceiling (e.g. 3145728 -> "3MB"). */
export function formatMaxMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)}MB`;
}

export const RATIO_TOLERANCE = 0.03;

export function parseRatio(label: string): number {
  const [w, h] = label.split(":").map(Number);
  if (!Number.isFinite(w) || !Number.isFinite(h) || h === 0) return NaN;
  return w / h;
}

export function ratioMatches(width: number, height: number, allowed: string[]): boolean {
  if (!width || !height) return false;
  const actual = width / height;
  return allowed.some((label) => {
    const target = parseRatio(label);
    if (!Number.isFinite(target)) return false;
    return Math.abs(actual - target) / target <= RATIO_TOLERANCE;
  });
}

/** Nearest allowed ratio by relative distance; ties resolve to the first entry. */
export function nearestAllowedRatio(width: number, height: number, allowed: string[]): string {
  const fallback = allowed[0] ?? "1:1";
  if (!width || !height) return fallback;
  const actual = width / height;
  let best = fallback;
  let bestDist = Infinity;
  for (const label of allowed) {
    const target = parseRatio(label);
    if (!Number.isFinite(target)) continue;
    const dist = Math.abs(actual - target) / target;
    if (dist < bestDist) {
      bestDist = dist;
      best = label;
    }
  }
  return best;
}

/**
 * Cloudinary transformation that pads (never crops) an image to `ratio`.
 * White padding keeps the catalogue grid visually consistent while leaving
 * every pixel of the product intact.
 */
export function normalisationTransformation(ratio: string): string {
  return `ar_${ratio.replace(":", ":")},c_pad,b_white,f_auto,q_auto`;
}

/** Insert a transformation into a Cloudinary delivery URL. */
export function applyTransformation(url: string, transformation: string): string {
  const marker = "/upload/";
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  const at = idx + marker.length;
  return `${url.slice(0, at)}${transformation}/${url.slice(at)}`;
}

// ── Validation ─────────────────────────────────────────────────

export type MediaIssueCode =
  | "format_not_allowed"
  | "too_small"
  | "too_large"
  | "ratio_not_allowed"
  | "video_too_short_resolution"
  | "video_too_long"
  | "too_many_images"
  | "too_many_videos";

export interface MediaIssue {
  code: MediaIssueCode;
  message: string;
}

export interface ImageMeta {
  width: number;
  height: number;
  bytes: number;
  format: string;
}

export interface VideoMeta {
  width?: number;
  height: number;
  bytes: number;
  format: string;
  durationSeconds: number;
}

export interface MediaValidation {
  ok: boolean;
  errors: MediaIssue[];
  advisories: MediaIssue[];
  /** Set when the image is out of ratio and auto-normalisation is enabled. */
  normalise?: { toRatio: string; transformation: string };
}

function normaliseFormat(format: string): string {
  const f = format.toLowerCase().replace(/^image\//, "").replace(/^video\//, "");
  if (f === "jpg") return "jpeg";
  if (f === "quicktime" || f === "mov") return "mov";
  return f;
}

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateImage(meta: ImageMeta, cfg: MediaConfig): MediaValidation {
  const errors: MediaIssue[] = [];
  const advisories: MediaIssue[] = [];
  const format = normaliseFormat(meta.format);

  if (!cfg.imageAllowedFormats.includes(format)) {
    errors.push({
      code: "format_not_allowed",
      message: format === "heic" || format === "heif"
        ? "iPhone HEIC photos aren't supported. On your iPhone go to Settings > Camera > Formats and choose 'Most Compatible', or re-save the photo as JPEG."
        : `${format.toUpperCase()} isn't supported. Use ${cfg.imageAllowedFormats.map((f) => f.toUpperCase()).join(", ")}.`,
    });
  }

  if (meta.width < cfg.imageMinDimensionPx || meta.height < cfg.imageMinDimensionPx) {
    errors.push({
      code: "too_small",
      message: `This image is ${meta.width}x${meta.height}. Minimum is ${cfg.imageMinDimensionPx}x${cfg.imageMinDimensionPx}.`,
    });
  }

  if (meta.bytes > cfg.imageMaxBytes) {
    errors.push({
      code: "too_large",
      message: `This image is ${mb(meta.bytes)}. Maximum is ${mb(cfg.imageMaxBytes)}.`,
    });
  }

  let normalise: MediaValidation["normalise"];
  const ratioOk = ratioMatches(meta.width, meta.height, cfg.imageAllowedRatios);
  if (!ratioOk) {
    const target = nearestAllowedRatio(meta.width, meta.height, cfg.imageAllowedRatios);
    if (cfg.imageAutoNormaliseRatio) {
      normalise = { toRatio: target, transformation: normalisationTransformation(target) };
      advisories.push({
        code: "ratio_not_allowed",
        message: `This image is ${meta.width}x${meta.height}. We'll pad it with white to ${target} so it lines up with the rest of the catalogue. Nothing is cropped out.`,
      });
    } else {
      errors.push({
        code: "ratio_not_allowed",
        message: `This image is ${meta.width}x${meta.height}. Allowed shapes are ${cfg.imageAllowedRatios.join(", ")}.`,
      });
    }
  }

  if (Math.max(meta.width, meta.height) < cfg.imageRecommendedMinPx) {
    advisories.push({
      code: "too_small",
      message: `For the sharpest listing we recommend at least ${cfg.imageRecommendedMinPx}px on the longest side.`,
    });
  }

  return { ok: errors.length === 0, errors, advisories, normalise };
}

export function validateVideo(meta: VideoMeta, cfg: MediaConfig): MediaValidation {
  const errors: MediaIssue[] = [];
  const advisories: MediaIssue[] = [];
  const format = normaliseFormat(meta.format);

  if (!cfg.videoAllowedFormats.includes(format)) {
    errors.push({
      code: "format_not_allowed",
      message: `${format.toUpperCase()} video isn't supported. Use ${cfg.videoAllowedFormats.map((f) => f.toUpperCase()).join(" or ")}.`,
    });
  }
  if (meta.height && meta.height < cfg.videoMinHeightPx) {
    errors.push({
      code: "video_too_short_resolution",
      message: `This video is ${meta.height}p. Minimum is ${cfg.videoMinHeightPx}p.`,
    });
  }
  if (meta.bytes > cfg.videoMaxBytes) {
    errors.push({
      code: "too_large",
      message: `This video is ${mb(meta.bytes)}. Maximum is ${mb(cfg.videoMaxBytes)}.`,
    });
  }
  if (meta.durationSeconds > cfg.videoMaxSeconds) {
    errors.push({
      code: "video_too_long",
      message: `This video is ${Math.round(meta.durationSeconds)}s. Maximum is ${cfg.videoMaxSeconds}s.`,
    });
  }
  if (meta.width && meta.height && !ratioMatches(meta.width, meta.height, cfg.videoAllowedRatios)) {
    advisories.push({
      code: "ratio_not_allowed",
      message: `Recommended video shapes are ${cfg.videoAllowedRatios.join(", ")}.`,
    });
  }
  return { ok: errors.length === 0, errors, advisories };
}

/** Publish gate: draft saving never calls this. */
export function validateProductMediaForPublish(
  counts: { images: number; videos: number },
  cfg: MediaConfig,
): MediaValidation {
  const errors: MediaIssue[] = [];
  if (counts.images < cfg.productMinImagesToPublish) {
    errors.push({
      code: "too_small",
      message: `Add at least ${cfg.productMinImagesToPublish} images to publish (you have ${counts.images}). You can keep saving this as a draft.`,
    });
  }
  if (counts.images > cfg.productMaxImages) {
    errors.push({ code: "too_many_images", message: `Maximum ${cfg.productMaxImages} images.` });
  }
  if (counts.videos > cfg.productMaxVideos) {
    errors.push({ code: "too_many_videos", message: `Maximum ${cfg.productMaxVideos} video.` });
  }
  return { ok: errors.length === 0, errors, advisories: [] };
}