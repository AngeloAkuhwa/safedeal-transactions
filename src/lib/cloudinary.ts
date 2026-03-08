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
