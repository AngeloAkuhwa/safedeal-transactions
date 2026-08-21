/**
 * SafeDeal Image Standard: delivery layer.
 *
 * Every product photo is stored once (master, capped at 2000px) and delivered
 * through named Cloudinary renditions built purely from URL transformations —
 * no paid add-ons, no extra storage.
 *
 * Renditions are always square (`c_fill,g_auto,ar_1:1`) so grids never jump,
 * lightly enhanced (`e_improve`) and format/quality negotiated (`f_auto,q_auto`).
 */

export type ProductRendition = "thumb" | "card" | "detail" | "zoom";

export const PRODUCT_RENDITION_SIZES: Record<ProductRendition, number> = {
  thumb: 200,
  card: 400,
  detail: 800,
  zoom: 1600,
};

/** Transformation applied to the ORIGINAL upload (incoming transformation). */
export const MASTER_INCOMING_TRANSFORMATION = "c_limit,w_2000,h_2000,q_auto:good";

const BASE_TRANSFORM = "c_fill,g_auto,ar_1:1,e_improve,f_auto,q_auto";

function isCloudinary(url: string): boolean {
  return url.includes("/upload/");
}

/** Strip any transformation segment already present after `/upload/`. */
function splitCloudinaryUrl(url: string): { head: string; tail: string } | null {
  const marker = "/upload/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const at = idx + marker.length;
  const head = url.slice(0, at);
  let tail = url.slice(at);
  const slash = tail.indexOf("/");
  const first = slash === -1 ? tail : tail.slice(0, slash);
  const isVersion = /^v\d+$/.test(first);
  const isTransform =
    !isVersion &&
    (first.includes(",") ||
      /^(q_|f_|w_|h_|c_|e_|dpr_|g_|so_|t_|fl_|ar_|b_|bo_|co_|l_|o_|r_|x_|y_|z_)/.test(first));
  if (isTransform && slash !== -1) tail = tail.slice(slash + 1);
  return { head, tail };
}

/**
 * Build a named rendition URL for a stored Cloudinary URL.
 * Non-Cloudinary URLs (or empty values) are returned untouched.
 */
export function productImageUrl(url: string | null | undefined, rendition: ProductRendition = "card"): string {
  if (!url) return "";
  if (!isCloudinary(url)) return url;
  const parts = splitCloudinaryUrl(url);
  if (!parts) return url;
  const size = PRODUCT_RENDITION_SIZES[rendition];
  return `${parts.head}w_${size},h_${size},${BASE_TRANSFORM}/${parts.tail}`;
}

/** srcset across every rendition at or below `max`. */
export function productImageSrcSet(
  url: string | null | undefined,
  max: ProductRendition = "zoom",
): string {
  if (!url || !isCloudinary(url)) return "";
  const maxSize = PRODUCT_RENDITION_SIZES[max];
  return (Object.keys(PRODUCT_RENDITION_SIZES) as ProductRendition[])
    .filter((r) => PRODUCT_RENDITION_SIZES[r] <= maxSize)
    .map((r) => `${productImageUrl(url, r)} ${PRODUCT_RENDITION_SIZES[r]}w`)
    .join(", ");
}

/** Everything an <img> needs for one product photo. */
export function productImageProps(
  url: string | null | undefined,
  rendition: ProductRendition = "card",
  sizes?: string,
): { src: string; srcSet?: string; sizes?: string; width: number; height: number } {
  const size = PRODUCT_RENDITION_SIZES[rendition];
  const srcSet = productImageSrcSet(url, rendition);
  return {
    src: productImageUrl(url, rendition),
    ...(srcSet ? { srcSet } : {}),
    ...(srcSet && sizes ? { sizes } : {}),
    width: size,
    height: size,
  };
}
