import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  storeShareMetaUrl,
  productShareMetaUrl,
  whatsappShareUrl,
  storeUrl,
  productUrl,
} from "@/lib/share-urls";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("share URL builders", () => {
  it("store share-meta URL targets the public edge function", () => {
    expect(storeShareMetaUrl("chioma")).toContain("/functions/v1/share-meta?type=store&slug=chioma");
  });

  it("product share-meta URL carries store + product slugs", () => {
    expect(productShareMetaUrl("chioma", "iphone-13")).toContain(
      "/functions/v1/share-meta?type=product&store=chioma&slug=iphone-13",
    );
  });

  it("copy-link URLs stay clean and canonical", () => {
    expect(storeUrl("chioma", "https://app.test")).toBe("https://app.test/store/chioma");
    expect(productUrl("chioma", "iphone-13", "https://app.test")).toBe(
      "https://app.test/store/chioma/iphone-13",
    );
  });

  it("whatsapp deep link encodes the share URL", () => {
    const url = whatsappShareUrl("Hi", "https://x.test/functions/v1/share-meta?type=store&slug=a");
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(url)).toContain("share-meta?type=store&slug=a");
  });
});

describe("WhatsApp share actions use the rich-preview URL", () => {
  const surfaces = [
    "src/components/storefront/StorefrontShareCard.tsx",
    "src/components/storefront/PublishSuccessModal.tsx",
    "src/pages/PublicProductDetail.tsx",
  ];

  it.each(surfaces)("%s shares a share-meta URL, not a bare SPA URL", (file) => {
    const src = read(file);
    expect(src).toMatch(/openWhatsAppShare\(/);
    expect(src).toMatch(/ShareMetaUrl\(/);
  });

  it("copy-link actions still copy the canonical SPA URL", () => {
    const card = read("src/components/storefront/StorefrontShareCard.tsx");
    expect(card).toContain("navigator.clipboard.writeText(storeUrl)");
  });

  it("robots.txt advertises the dynamic sitemap edge function", () => {
    const robots = read("public/robots.txt");
    expect(robots).toContain("/functions/v1/sitemap");
    expect(robots).toContain("https://trust-link-secure.lovable.app/sitemap.xml");
  });

  it("share-meta and sitemap are public (verify_jwt = false)", () => {
    const config = read("supabase/config.toml");
    expect(config).toMatch(/\[functions\.share-meta\]\nverify_jwt = false/);
    expect(config).toMatch(/\[functions\.sitemap\]\nverify_jwt = false/);
  });
});
