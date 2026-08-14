/**
 * Share URLs.
 *
 * SafeDeal is a client-rendered SPA: WhatsApp / Facebook / X crawlers do not
 * run JS, so a canonical `/store/:slug` link always previews with the generic
 * site-wide OG tags. The `share-meta` edge function renders a real per-store /
 * per-product OG document and instantly redirects humans to the canonical URL.
 *
 * Rule of thumb used across the app:
 *  - "Copy link" copies the CLEAN canonical SPA URL (nice to read, nice to type)
 *  - "Share on WhatsApp" (and other preview-driven shares) use the share-meta
 *    URL so the recipient sees a rich card.
 */

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

function appOrigin(): string {
  return typeof window !== "undefined" ? window.location.origin : "";
}

/** Canonical SPA URL for a public storefront. */
export function storeUrl(slug: string, origin = appOrigin()): string {
  return `${origin}/store/${slug}`;
}

/** Canonical SPA URL for a public product. */
export function productUrl(storeSlug: string, productSlug: string, origin = appOrigin()): string {
  return `${origin}/store/${storeSlug}/${productSlug}`;
}

/** Crawler-friendly (rich preview) URL for a storefront. */
export function storeShareMetaUrl(slug: string): string {
  return `${FUNCTIONS_BASE}/share-meta?type=store&slug=${encodeURIComponent(slug)}`;
}

/** Crawler-friendly (rich preview) URL for a product. */
export function productShareMetaUrl(storeSlug: string, productSlug: string): string {
  return `${FUNCTIONS_BASE}/share-meta?type=product&store=${encodeURIComponent(
    storeSlug,
  )}&slug=${encodeURIComponent(productSlug)}`;
}

/** wa.me deep link. The URL passed here MUST be a share-meta URL. */
export function whatsappShareUrl(text: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
}

export function openWhatsAppShare(text: string, url: string) {
  window.open(whatsappShareUrl(text, url), "_blank", "noopener,noreferrer");
}
