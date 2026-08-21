import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  safeImageUrl,
  buildStoreMeta,
  buildProductMeta,
  renderShareHtml,
  GENERIC_META,
  DEFAULT_OG_IMAGE,
} from "../share-meta";

describe("share-meta escaping", () => {
  it("escapes HTML in store names (store names are user input)", () => {
    const meta = buildStoreMeta({
      storeName: '<script>alert(1)</script>',
      slug: "evil-store",
      productCount: 2,
    });
    const html = renderShareHtml(meta);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    // The only <script> tag in the document is the redirect fallback.
    expect(html.match(/<script/g)?.length).toBe(1);
  });

  it("escapes quotes so attributes cannot be broken out of", () => {
    const html = renderShareHtml(
      buildProductMeta({
        title: '" onload="alert(1)',
        priceMajor: 1000,
        storeSlug: "s",
        productSlug: "p",
      }),
    );
    expect(html).not.toContain('" onload="alert(1)');
    expect(html).toContain("&quot; onload=&quot;alert(1)");
  });

  it("neutralises script-breaking sequences in the JS redirect", () => {
    const html = renderShareHtml({
      ...GENERIC_META,
      canonicalUrl: 'https://x.test/</script><script>alert(1)</script>',
    });
    expect(html.match(/<script/g)?.length).toBe(1);
  });

  it("escapeHtml covers the five dangerous characters", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });
});

describe("share-meta content", () => {
  it("builds a verified store title", () => {
    const meta = buildStoreMeta({
      storeName: "Chioma's Store",
      slug: "chioma",
      productCount: 4,
      verified: true,
      imageUrl: "https://res.cloudinary.com/x/a.jpg",
    });
    expect(meta.title).toBe("Chioma's Store on SafeDeal: Verified Vendor");
    expect(meta.canonicalUrl).toBe("https://trust-link-secure.lovable.app/store/chioma");
    expect(meta.image).toBe("https://res.cloudinary.com/x/a.jpg");
  });

  it("builds a naira product title", () => {
    const meta = buildProductMeta({
      title: "iPhone 13",
      priceMajor: 450000,
      currencyCode: "NGN",
      storeName: "Chioma's Store",
      storeSlug: "chioma",
      productSlug: "iphone-13",
    });
    expect(meta.title).toBe("iPhone 13: ₦450,000 · Protected by SafeDeal");
    expect(meta.canonicalUrl).toBe(
      "https://trust-link-secure.lovable.app/store/chioma/iphone-13",
    );
  });

  it("falls back to the default OG image for missing/unsafe images", () => {
    expect(safeImageUrl(null)).toBe(DEFAULT_OG_IMAGE);
    expect(safeImageUrl("javascript:alert(1)")).toBe(DEFAULT_OG_IMAGE);
    expect(safeImageUrl("/relative.jpg")).toBe(DEFAULT_OG_IMAGE);
    expect(safeImageUrl("https://cdn.test/a.jpg")).toBe("https://cdn.test/a.jpg");
  });

  it("generic meta (unknown/private slug path) is a complete OG document", () => {
    const html = renderShareHtml(GENERIC_META);
    expect(html).toContain('<meta property="og:title" content="SafeDeal: Protected Deals"');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image"');
    expect(html).toContain(`content="${DEFAULT_OG_IMAGE}"`);
    expect(html).toContain('<meta http-equiv="refresh" content="0;url=https://trust-link-secure.lovable.app/"');
    expect(html.startsWith("<!doctype html>")).toBe(true);
  });
});
