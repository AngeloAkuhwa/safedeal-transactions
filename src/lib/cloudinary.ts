/**
 * Build a Cloudinary thumbnail URL by inserting resize transforms.
 * Handles URLs that already contain a transform segment (e.g. q_auto,f_auto)
 * by merging the resize params into the existing segment instead of stacking
 * a second transform segment (which Cloudinary may reject).
 */
export function getCloudinaryThumbnail(
  fileUrl: string,
  width = 200,
  height = 200
): string {
  const marker = "/upload/";
  const idx = fileUrl.indexOf(marker);
  if (idx === -1) return fileUrl;
  const insertAt = idx + marker.length;
  const after = fileUrl.slice(insertAt);
  const slashIdx = after.indexOf("/");
  const firstSegment = slashIdx === -1 ? after : after.slice(0, slashIdx);
  const rest = slashIdx === -1 ? "" : after.slice(slashIdx);

  // Detect existing Cloudinary transform segment.
  // Skip version segments like "v1234567890".
  const isVersion = /^v\d+$/.test(firstSegment);
  const isTransform =
    !isVersion &&
    (firstSegment.includes(",") ||
      /^(q_|f_|w_|h_|c_|e_|dpr_|g_|so_|t_|fl_|ar_|b_|bo_|co_|l_|o_|r_|x_|y_|z_)/.test(
        firstSegment
      ));

  const resize = `w_${width},h_${height},c_fill`;

  if (isTransform) {
    // Merge into existing transform segment to avoid double-stacking.
    return `${fileUrl.slice(0, insertAt)}${resize},${firstSegment}${rest}`;
  }
  // Fresh transform segment.
  return `${fileUrl.slice(0, insertAt)}${resize},q_auto,f_auto/${after}`;
}

/**
 * Force-download URL for any Cloudinary asset by adding fl_attachment.
 * Falls back to original URL for non-Cloudinary files.
 */
export function getCloudinaryDownloadUrl(fileUrl: string, filename?: string): string {
  if (!fileUrl) return fileUrl;
  const marker = "/upload/";
  const idx = fileUrl.indexOf(marker);
  if (idx === -1) return fileUrl;
  const insertAt = idx + marker.length;
  const flag = filename ? `fl_attachment:${encodeURIComponent(filename)}` : "fl_attachment";
  return `${fileUrl.slice(0, insertAt)}${flag}/${fileUrl.slice(insertAt)}`;
}

/**
 * Generate a real video poster frame URL from a Cloudinary video URL.
 * Captures a frame at ~1s and returns a JPG. Returns null for non-Cloudinary URLs.
 */
export function getCloudinaryVideoPoster(
  videoUrl: string,
  width = 256,
  height = 256
): string | null {
  if (!videoUrl) return null;
  const marker = "/upload/";
  const idx = videoUrl.indexOf(marker);
  if (idx === -1 || !videoUrl.includes("res.cloudinary.com")) return null;
  const insertAt = idx + marker.length;
  const transform = `so_1,w_${width},h_${height},c_fill,f_jpg/`;
  // Swap extension to .jpg
  const withTransform = `${videoUrl.slice(0, insertAt)}${transform}${videoUrl.slice(insertAt)}`;
  return withTransform.replace(/\.(mp4|mov|webm|avi|mkv|m4v)(\?|$)/i, ".jpg$2");
}
