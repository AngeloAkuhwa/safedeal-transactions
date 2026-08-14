import { describe, it, expect } from "vitest";
import {
  MASTER_INCOMING_TRANSFORMATION,
  PRODUCT_RENDITION_SIZES,
  productImageProps,
  productImageSrcSet,
  productImageUrl,
} from "@/lib/product-image";
import {
  meetsPublishImageMinimum,
  TOO_SMALL_MESSAGE,
  validateProductImageStandard,
  laplacianVariance,
} from "@/lib/image-quality";

const BASE = "https://res.cloudinary.com/demo/image/upload/v1712345678/SafeDeal/products/u1/photo.jpg";

describe("product image renditions", () => {
  it("builds the correct transformation string per rendition", () => {
    expect(productImageUrl(BASE, "thumb")).toBe(
      "https://res.cloudinary.com/demo/image/upload/w_200,h_200,c_fill,g_auto,ar_1:1,e_improve,f_auto,q_auto/v1712345678/SafeDeal/products/u1/photo.jpg",
    );
    expect(productImageUrl(BASE, "card")).toContain("w_400,h_400,c_fill,g_auto,ar_1:1,e_improve,f_auto,q_auto");
    expect(productImageUrl(BASE, "detail")).toContain("w_800,h_800,");
    expect(productImageUrl(BASE, "zoom")).toContain("w_1600,h_1600,");
  });

  it("replaces an existing transformation segment instead of stacking", () => {
    const withTransform = "https://res.cloudinary.com/demo/image/upload/q_auto,f_auto/v1/p.jpg";
    const out = productImageUrl(withTransform, "card");
    expect(out).toBe(
      "https://res.cloudinary.com/demo/image/upload/w_400,h_400,c_fill,g_auto,ar_1:1,e_improve,f_auto,q_auto/v1/p.jpg",
    );
    expect(out.match(/upload\//g)).toHaveLength(1);
  });

  it("leaves non-Cloudinary URLs untouched and handles empty values", () => {
    expect(productImageUrl("https://example.com/a.jpg", "card")).toBe("https://example.com/a.jpg");
    expect(productImageUrl(null)).toBe("");
    expect(productImageSrcSet("https://example.com/a.jpg")).toBe("");
  });

  it("emits a srcset capped at the requested rendition", () => {
    const set = productImageSrcSet(BASE, "detail");
    expect(set).toContain("200w");
    expect(set).toContain("400w");
    expect(set).toContain("800w");
    expect(set).not.toContain("1600w");
  });

  it("returns explicit intrinsic dimensions for layout stability", () => {
    const props = productImageProps(BASE, "card", "50vw");
    expect(props.width).toBe(PRODUCT_RENDITION_SIZES.card);
    expect(props.height).toBe(PRODUCT_RENDITION_SIZES.card);
    expect(props.sizes).toBe("50vw");
  });

  it("caps stored masters at 2000px", () => {
    expect(MASTER_INCOMING_TRANSFORMATION).toBe("c_limit,w_2000,h_2000,q_auto:good");
  });
});

describe("image standard validation", () => {
  it("rejects a 500x500 image with the friendly message", () => {
    const res = validateProductImageStandard({ width: 500, height: 500, bytes: 100_000 });
    expect(res.ok).toBe(false);
    expect(res.errors[0].code).toBe("too_small");
    expect(res.errors[0].message).toBe(TOO_SMALL_MESSAGE);
  });

  it("accepts an 800x800 image under 10MB", () => {
    expect(validateProductImageStandard({ width: 800, height: 800, bytes: 2_000_000 }).ok).toBe(true);
  });

  it("rejects images above 10MB", () => {
    const res = validateProductImageStandard({ width: 1600, height: 1600, bytes: 11 * 1024 * 1024 });
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.code === "too_large")).toBe(true);
  });

  it("gates publish on the minimum image count", () => {
    expect(meetsPublishImageMinimum(2, 3)).toBe(false);
    expect(meetsPublishImageMinimum(3, 3)).toBe(true);
    expect(meetsPublishImageMinimum(5, 3)).toBe(true);
  });

  it("scores a flat (blurry) surface lower than a high-contrast one", () => {
    const w = 8, h = 8;
    const flat = new Float32Array(w * h).fill(128);
    const noisy = new Float32Array(w * h);
    for (let i = 0; i < noisy.length; i++) noisy[i] = i % 2 === 0 ? 0 : 255;
    expect(laplacianVariance(flat, w, h)).toBe(0);
    expect(laplacianVariance(noisy, w, h)).toBeGreaterThan(laplacianVariance(flat, w, h));
  });
});
