/**
 * Build a Cloudinary thumbnail URL by inserting resize transforms.
 * Expects a URL like: .../upload/q_auto,f_auto/...
 * Returns: .../upload/w_200,h_200,c_fill,q_auto,f_auto/...
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
  return `${fileUrl.slice(0, insertAt)}w_${width},h_${height},c_fill,${fileUrl.slice(insertAt)}`;
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
