/**
 * Pure helpers for the public `share-meta` crawler surface.
 *
 * SafeDeal is a Vite SPA, so WhatsApp/Facebook/Twitter crawlers (which do not
 * execute JS) only ever see the static index.html head. `share-meta` renders a
 * tiny server-side HTML document with real per-store / per-product OG tags and
 * bounces human visitors on to the canonical SPA URL.
 *
 * Everything interpolated here (store names, product titles) is USER INPUT and
 * MUST be escaped: these helpers are the single escaping choke point.
 */

export const SITE_ORIGIN = "https://trust-link-secure.lovable.app";
export const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/og-default.jpg`;

/** Escape a value for safe interpolation inside HTML text and attributes. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escape a value for safe interpolation inside a <script> string literal. */
export function escapeJsString(value: unknown): string {
  return JSON.stringify(String(value ?? "")).slice(1, -1).replace(/</g, "\\u003c");
}

/**
 * Only http(s) URLs are ever emitted as og:image. Never `javascript:`,
 * `data:` or a relative path a crawler cannot resolve.
 */
export function safeImageUrl(url: string | null | undefined): string {
  if (!url) return DEFAULT_OG_IMAGE;
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return DEFAULT_OG_IMAGE;
  return trimmed;
}

export interface ShareMeta {
  title: string;
  description: string;
  image: string;
  /** Canonical SPA URL humans and search engines should end up on. */
  canonicalUrl: string;
}

export const GENERIC_META: ShareMeta = {
  title: "SafeDeal: Protected Deals",
  description:
    "Buy and sell safely in Nigeria. SafeDeal holds the money in escrow until the buyer confirms delivery.",
  image: DEFAULT_OG_IMAGE,
  canonicalUrl: `${SITE_ORIGIN}/`,
};

export function storeCanonicalUrl(slug: string, origin = SITE_ORIGIN): string {
  return `${origin}/store/${encodeURIComponent(slug)}`;
}

export function productCanonicalUrl(
  storeSlug: string,
  productSlug: string,
  origin = SITE_ORIGIN,
): string {
  return `${origin}/store/${encodeURIComponent(storeSlug)}/${encodeURIComponent(productSlug)}`;
}

/** "Chioma's Store on SafeDeal: Verified Vendor" */
export function buildStoreMeta(params: {
  storeName: string;
  slug: string;
  productCount: number;
  imageUrl?: string | null;
  verified?: boolean;
  origin?: string;
}): ShareMeta {
  const name = (params.storeName || "").trim() || "SafeDeal Store";
  const suffix = params.verified ? ": Verified Vendor" : "";
  const count = Math.max(0, params.productCount || 0);
  const items = count === 1 ? "1 item" : `${count} items`;
  return {
    title: `${name} on SafeDeal${suffix}`,
    description:
      count > 0
        ? `Browse ${items} from ${name}. Every order is protected by SafeDeal escrow. The seller is only paid after you confirm delivery.`
        : `${name} on SafeDeal. Every order is protected by SafeDeal escrow. The seller is only paid after you confirm delivery.`,
    image: safeImageUrl(params.imageUrl),
    canonicalUrl: storeCanonicalUrl(params.slug, params.origin),
  };
}

/** "iPhone 13: ₦450,000 · Protected by SafeDeal" */
export function buildProductMeta(params: {
  title: string;
  priceMajor: number;
  currencyCode?: string | null;
  storeName?: string | null;
  storeSlug: string;
  productSlug: string;
  imageUrl?: string | null;
  origin?: string;
}): ShareMeta {
  const symbol = (params.currencyCode || "NGN").toUpperCase() === "NGN"
    ? "₦"
    : `${(params.currencyCode || "").toUpperCase()} `;
  const price = `${symbol}${Math.round(Number(params.priceMajor) || 0).toLocaleString("en-NG")}`;
  const seller = (params.storeName || "").trim();
  return {
    title: `${(params.title || "Product").trim()}: ${price} · Protected by SafeDeal`,
    description: seller
      ? `${price} from ${seller} on SafeDeal. Pay into escrow. The seller is only paid after you confirm delivery.`
      : `${price} on SafeDeal. Pay into escrow. The seller is only paid after you confirm delivery.`,
    image: safeImageUrl(params.imageUrl),
    canonicalUrl: productCanonicalUrl(params.storeSlug, params.productSlug, params.origin),
  };
}

/**
 * A complete minimal HTML document: rich OG head for crawlers, instant
 * redirect for humans.
 */
export function renderShareHtml(meta: ShareMeta): string {
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const image = escapeHtml(safeImageUrl(meta.image));
  const url = escapeHtml(meta.canonicalUrl);
  const jsUrl = escapeJsString(meta.canonicalUrl);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<meta name="description" content="${description}" />
<link rel="canonical" href="${url}" />
<meta property="og:site_name" content="SafeDeal" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:image" content="${image}" />
<meta property="og:url" content="${url}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${image}" />
<meta http-equiv="refresh" content="0;url=${url}" />
<script>location.replace("${jsUrl}");</script>
</head>
<body>
<p>Redirecting to <a href="${url}">${title}</a>…</p>
</body>
</html>`;
}