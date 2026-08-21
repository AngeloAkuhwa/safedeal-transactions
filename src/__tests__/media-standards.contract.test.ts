import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  FALLBACK_MEDIA_CONFIG,
  parseMediaConfig,
  nearestAllowedRatio,
  normalisationTransformation,
  ratioMatches,
  validateImage,
  validateVideo,
  validateProductMediaForPublish,
} from "@/lib/media-rules";
import { SETTINGS_CATALOG } from "@/lib/settings-catalog";

const cfg = FALLBACK_MEDIA_CONFIG;
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("media rules: hard blocks", () => {
  it("rejects an image below the minimum dimension with a specific message", () => {
    const res = validateImage({ width: 640, height: 480, bytes: 100_000, format: "jpg" }, cfg);
    expect(res.ok).toBe(false);
    expect(res.errors[0].message).toContain("640");
    expect(res.errors[0].message).toContain(String(cfg.imageMinDimensionPx));
  });

  it("rejects an oversized image", () => {
    const res = validateImage({ width: 1600, height: 1600, bytes: cfg.imageMaxBytes + 1, format: "jpg" }, cfg);
    expect(res.ok).toBe(false);
  });

  it("rejects a disallowed format", () => {
    const res = validateImage({ width: 1600, height: 1600, bytes: 100_000, format: "heic" }, cfg);
    expect(res.ok).toBe(false);
  });

  it("accepts a compliant square image", () => {
    const res = validateImage({ width: 1600, height: 1600, bytes: 500_000, format: "jpg" }, cfg);
    expect(res.ok).toBe(true);
    expect(res.normalise).toBeUndefined();
  });
});

describe("aspect ratio: normalise, never crop", () => {
  it("treats 4:3 phone photos as normalisable, not rejected", () => {
    const res = validateImage({ width: 1600, height: 1200, bytes: 500_000, format: "jpg" }, cfg);
    expect(res.ok).toBe(true);
    expect(res.normalise).toBeDefined();
    expect(res.normalise!.transformation).toContain("c_pad");
    expect(res.normalise!.transformation).toContain("b_white");
  });

  it("rejects out-of-ratio images when auto-normalise is off", () => {
    const strict = { ...cfg, imageAutoNormaliseRatio: false };
    const res = validateImage({ width: 1600, height: 1200, bytes: 500_000, format: "jpg" }, strict);
    expect(res.ok).toBe(false);
  });

  it("pads rather than crops and picks the nearest allowed ratio", () => {
    expect(ratioMatches(1000, 1000, cfg.imageAllowedRatios)).toBe(true);
    expect(nearestAllowedRatio(1600, 1200, cfg.imageAllowedRatios)).toBeTruthy();
    expect(normalisationTransformation("1:1")).not.toContain("c_fill");
  });
});

describe("video rules", () => {
  it("rejects sub-720p video", () => {
    const res = validateVideo({ width: 640, height: 480, bytes: 1_000_000, format: "mp4", durationSeconds: 10 }, cfg);
    expect(res.ok).toBe(false);
  });
  it("rejects over-long video", () => {
    const res = validateVideo({ width: 1280, height: 720, bytes: 1_000_000, format: "mp4", durationSeconds: cfg.videoMaxSeconds + 1 }, cfg);
    expect(res.ok).toBe(false);
  });
  it("accepts a compliant clip", () => {
    const res = validateVideo({ width: 1280, height: 720, bytes: 1_000_000, format: "mp4", durationSeconds: 20 }, cfg);
    expect(res.ok).toBe(true);
  });
});

describe("publish gate", () => {
  it("requires the configured minimum image count", () => {
    expect(validateProductMediaForPublish({ images: cfg.productMinImagesToPublish - 1, videos: 0 }, cfg).ok).toBe(false);
    expect(validateProductMediaForPublish({ images: cfg.productMinImagesToPublish, videos: 0 }, cfg).ok).toBe(true);
  });
  it("caps the maximum image count", () => {
    expect(validateProductMediaForPublish({ images: cfg.productMaxImages + 1, videos: 0 }, cfg).ok).toBe(false);
  });
});

describe("config is the single source of truth", () => {
  it("parses raw setting rows into a config", () => {
    const parsed = parseMediaConfig({ "media.image_min_dimension_px": 1000, "media.product_max_images": 6 });
    expect(parsed.imageMinDimensionPx).toBe(1000);
    expect(parsed.productMaxImages).toBe(6);
  });

  it("registers every media key in BOTH catalogs (no orphan keys)", () => {
    const server = read("supabase/functions/_shared/settings-catalog.ts");
    const clientKeys = SETTINGS_CATALOG.filter((e) => e.key.startsWith("media.")).map((e) => e.key);
    expect(clientKeys.length).toBeGreaterThanOrEqual(17);
    for (const key of clientKeys) {
      expect(server, `${key} missing from server catalog`).toContain(key);
    }
    // The kill switch specifically must not be an orphan.
    expect(clientKeys).toContain("media.server_verification_enabled");
  });

  it("does not hardcode thresholds in the seller UI", () => {
    const page = read("src/pages/SellerProductCreate.tsx");
    expect(page).toContain("mediaConfig.productMaxImages");
    expect(page).not.toContain("Maximum 3 images allowed");
  });
});

describe("server-side bypass cannot skip validation", () => {
  it("upload-evidence re-reads the asset from the provider and deletes on failure", () => {
    const fn = read("supabase/functions/upload-evidence/index.ts");
    expect(fn).toContain("fetchCloudinaryResource");
    expect(fn).toContain("destroyCloudinaryAsset");
    expect(fn).toContain("media_rejected");
    // Fails closed with a retry-able message when the provider is unreachable.
    expect(fn).toContain("verification_unavailable");
    expect(fn).toContain("retryable: true");
  });

  it("seller-products enforces the publish minimum server-side", () => {
    const fn = read("supabase/functions/seller-products/index.ts");
    expect(fn).toContain("validateProductMediaForPublish");
    expect(fn).toContain("media_publish_requirements");
  });

  it("buyer-cart gates update_quantity, not just add", () => {
    const fn = read("supabase/functions/buyer-cart/index.ts");
    const qtyBlock = fn.slice(fn.indexOf('action === "update_quantity"'));
    expect(qtyBlock.slice(0, 1500)).toContain("checkAddToCartAllowed");
  });

  it("client and server commerce defaults both fail closed", () => {
    expect(read("src/hooks/useCommerceGate.ts")).toMatch(/addToCartEnabled:\s*false/);
    expect(read("supabase/functions/_shared/commerce-gate.ts")).toMatch(/add_to_cart_enabled:\s*false/);
  });
});