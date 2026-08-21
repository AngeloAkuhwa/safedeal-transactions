/**
 * SafeDeal Image Standard: capture-side quality checks.
 *
 * Pure browser helpers used before a product photo is uploaded:
 *  - minimum dimensions / size validation
 *  - a cheap blur heuristic (variance of a grayscale Laplacian)
 *  - square export from a crop rectangle
 */

export const PRODUCT_IMAGE_MIN_DIMENSION = 800;
export const PRODUCT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const PRODUCT_IMAGE_EXPORT_MAX = 1600;
/** Laplacian variance below this reads as visibly soft on a phone screen. */
export const BLUR_VARIANCE_THRESHOLD = 60;

export const TOO_SMALL_MESSAGE =
  "Photo too small: at least 800×800 needed. Move closer or use your camera's main lens.";

export interface ImageDimensions { width: number; height: number }

export interface ImageStandardIssue {
  code: "too_small" | "too_large";
  message: string;
}

/** Pure validation of already-measured metadata. */
export function validateProductImageStandard(
  meta: ImageDimensions & { bytes: number },
  opts: { minDimension?: number; maxBytes?: number } = {},
): { ok: boolean; errors: ImageStandardIssue[] } {
  const min = opts.minDimension ?? PRODUCT_IMAGE_MIN_DIMENSION;
  const maxBytes = opts.maxBytes ?? PRODUCT_IMAGE_MAX_BYTES;
  const errors: ImageStandardIssue[] = [];
  if (meta.width < min || meta.height < min) {
    errors.push({ code: "too_small", message: TOO_SMALL_MESSAGE });
  }
  if (meta.bytes > maxBytes) {
    errors.push({
      code: "too_large",
      message: `This photo is ${(meta.bytes / (1024 * 1024)).toFixed(1)}MB. Maximum is ${Math.round(maxBytes / (1024 * 1024))}MB.`,
    });
  }
  return { ok: errors.length === 0, errors };
}

/** Publish gate: a product needs `min` ready images before it can go live. */
export function meetsPublishImageMinimum(readyImageCount: number, min: number): boolean {
  return readyImageCount >= min;
}

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read this image."));
    img.src = src;
  });
}

export async function readImageDimensions(file: File): Promise<ImageDimensions> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(url);
    return { width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Variance of a 3x3 Laplacian over a downscaled grayscale copy.
 * Higher = sharper. Exported for testing with synthetic pixel data.
 */
export function laplacianVariance(gray: Float32Array, width: number, height: number): number {
  const vals: number[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const v =
        4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width];
      vals.push(v);
    }
  }
  if (vals.length === 0) return 0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
}

/** Quick sharpness score for a blob/URL. Returns null when it can't be measured. */
export async function measureSharpness(src: string, sample = 256): Promise<number | null> {
  try {
    const img = await loadImageElement(src);
    const scale = Math.min(1, sample / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(8, Math.round(img.naturalWidth * scale));
    const h = Math.max(8, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const gray = new Float32Array(w * h);
    for (let i = 0; i < gray.length; i++) {
      gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    }
    return laplacianVariance(gray, w, h);
  } catch {
    return null;
  }
}

export function isBlurry(score: number | null): boolean {
  return score !== null && score < BLUR_VARIANCE_THRESHOLD;
}

export interface CropArea { x: number; y: number; width: number; height: number }

/** Export the crop rectangle as a square JPEG capped at 1600×1600. */
export async function cropToSquareFile(
  src: string,
  crop: CropArea,
  fileName: string,
  maxSize = PRODUCT_IMAGE_EXPORT_MAX,
): Promise<File> {
  const img = await loadImageElement(src);
  const side = Math.min(Math.round(Math.min(crop.width, crop.height)), maxSize);
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, side, side);
  ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, side, side);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.92),
  );
  if (!blob) throw new Error("Could not process this photo.");
  const name = fileName.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}
