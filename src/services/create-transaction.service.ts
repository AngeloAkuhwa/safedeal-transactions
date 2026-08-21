import { supabase } from "@/integrations/supabase/client";
import { getMediaConfig } from "@/hooks/useMediaConfig";
import { validateImage, validateVideo } from "@/lib/media-rules";

export interface DraftTransaction {
  transaction_id: string;
  transaction_code: string;
  buyer_name: string;
  buyer_contact: string;
  item_title: string;
  item_description: string;
  item_quantity: number;
  /** Null when the seller never recorded it. Never fabricated server-side. */
  item_condition: string | null;
  price: number | null;
  currency_code: string | null;
  delivery_method: string | null;
  expected_delivery_date: string | null;
  verification_window_hours: number | null;
  seller_notes: string;
  created_at: string;
}

export interface CreateTransactionData {
  transaction_id?: string;
  buyer_name: string;
  buyer_contact: string;
  item_title: string;
  item_description: string;
  item_quantity: number;
  item_condition: string;
  price: number;
  currency_code: string;
  delivery_method: string;
  expected_delivery_date: string;
  verification_window_hours: number;
  seller_notes: string;
  file_ids?: string[];
}

export interface UploadedFile {
  file_id: string;
  secure_url: string;
  original_name: string;
  mime_type: string;
  fingerprint: string;
  /** Set when the server padded the image to an allowed aspect ratio. */
  normalised?: boolean;
  normalised_transformation?: string | null;
  original_secure_url?: string;
  width?: number | null;
  height?: number | null;
}

async function getAuthHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${session.access_token}` };
}

export async function getSellerDrafts(): Promise<DraftTransaction[]> {
  const headers = await getAuthHeader();
  const { data, error } = await supabase.functions.invoke("seller-drafts", { headers });
  if (error) throw new Error(error.message || "Failed to load drafts");
  if (!data || data.error) throw new Error(data?.error || "Failed to load drafts");
  return data.drafts as DraftTransaction[];
}

export async function saveDraft(formData: CreateTransactionData): Promise<{ transaction_id: string }> {
  const headers = await getAuthHeader();
  const { data, error } = await supabase.functions.invoke("create-transaction", {
    headers,
    body: { action: "save_draft", ...formData },
  });
  if (error) throw new Error(error.message || "Failed to save draft");
  if (!data || data.error) throw new Error(data?.error || "Failed to save draft");
  return data;
}

export interface PublishOfferResult {
  offer_url: string;
  offer_token: string;
  offer_id: string;
  buyer_linked: boolean;
  expires_at: string;
  items_count: number;
  total_amount: number;
  currency_code: string;
  // legacy compatibility
  share_url?: string;
  transaction_code?: string;
}

export async function publishTransaction(
  transactionId: string,
  options?: { items?: any[]; expires_in_days?: number },
): Promise<PublishOfferResult> {
  const headers = await getAuthHeader();
  const { data, error } = await supabase.functions.invoke("create-transaction", {
    headers,
    body: {
      action: "publish",
      transaction_id: transactionId,
      items: options?.items,
      expires_in_days: options?.expires_in_days,
    },
  });
  if (error) throw new Error(error.message || "Failed to publish offer");
  if (!data || data.error) throw new Error(data?.error || "Failed to publish offer");
  return data as PublishOfferResult;
}

/** Compute SHA-256 hash of a File */
async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = new Uint8Array(hashBuffer);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Validate magic bytes for image types */
function validateMagicBytes(buffer: ArrayBuffer, expectedType: string): boolean {
  const bytes = new Uint8Array(buffer.slice(0, 12));
  switch (expectedType) {
    case "image/jpeg":
      return bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
    case "image/png":
      return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
    case "image/webp":
      return bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
        && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    case "video/mp4":
      // ftyp box
      return bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
    default:
      return true;
  }
}

/** Check image minimum resolution (400×400) */
export function checkImageResolution(file: File, minW = 400, minH = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve(img.naturalWidth >= minW && img.naturalHeight >= minH);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      resolve(false);
    };
    img.src = URL.createObjectURL(file);
  });
}

/** Upload a product file (photo/video) to Cloudinary via upload-evidence */
export async function uploadProductFile(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<UploadedFile> {
  // Validate magic bytes
  const buffer = await file.arrayBuffer();
  if (!validateMagicBytes(buffer, file.type)) {
    throw new Error("File content doesn't match its type. Please upload a valid file.");
  }

  // Client-side pre-check: fail fast with a specific message before we spend
  // the seller's bandwidth. The server re-checks authoritatively afterwards.
  const preCheck = await validateProductFileLocally(file);
  if (preCheck.message) throw new Error(preCheck.message);

  // 1. Get signed upload params
  const headers = await getAuthHeader();
  const { data: signData, error: signErr } = await supabase.functions.invoke("upload-evidence", {
    headers,
    body: {
      action: "sign_upload",
      context: "product_evidence",
      resource_type: file.type.startsWith("video/") ? "video" : "image",
    },
  });
  if (signErr || !signData || signData.error) {
    throw new Error(signData?.error || "Failed to get upload signature");
  }

  const { timestamp, signature, api_key, cloud_name, folder, allowed_formats, max_file_size, transformation } = signData;

  // 2. Compute hash
  const fileHash = await computeFileHash(file);

  // 3. Upload to Cloudinary with XHR for progress
  const resourceType = file.type.startsWith("video/") ? "video" : "image";
  const uploadUrl = `https://api.cloudinary.com/v1_1/${cloud_name}/${resourceType}/upload`;

  const formDataUpload = new FormData();
  formDataUpload.append("file", file);
  formDataUpload.append("api_key", api_key);
  formDataUpload.append("timestamp", String(timestamp));
  formDataUpload.append("signature", signature);
  formDataUpload.append("folder", folder);
  // These were part of the signed payload, so they must be sent verbatim.
  if (allowed_formats) formDataUpload.append("allowed_formats", allowed_formats);
  if (max_file_size) formDataUpload.append("max_file_size", max_file_size);
  // Master cap (c_limit,w_2000,h_2000,q_auto:good). Signed, so send verbatim.
  if (transformation) formDataUpload.append("transformation", transformation);

  const cloudinaryResult = await new Promise<any>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error("Upload failed"));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(formDataUpload);
  });

  // 4. Register file in backend
  const { data: regData, error: regErr } = await supabase.functions.invoke("upload-evidence", {
    headers,
    body: {
      action: "register_file",
      public_id: cloudinaryResult.public_id,
      asset_id: cloudinaryResult.asset_id,
      secure_url: cloudinaryResult.secure_url,
      bytes: cloudinaryResult.bytes,
      format: cloudinaryResult.format,
      resource_type: cloudinaryResult.resource_type,
      original_filename: file.name,
      file_hash: fileHash,
      hash_algorithm: "sha256",
      context_type: "product_evidence",
    },
  });

  if (regErr || !regData || regData.error) {
    if (regData?.retryable) {
      throw new Error(regData.error);
    }
    throw new Error(regData?.error || "Failed to register file");
  }

  return {
    file_id: regData.file_id,
    secure_url: regData.secure_url,
    original_name: file.name,
    mime_type: regData.mime_type,
    fingerprint: regData.fingerprint,
    normalised: Boolean(regData.normalised),
    normalised_transformation: regData.normalised_transformation ?? null,
    original_secure_url: regData.original_secure_url,
    width: regData.width ?? null,
    height: regData.height ?? null,
  };
}

/** Reads real pixel dimensions in the browser and applies the shared rules. */
async function validateProductFileLocally(
  file: File,
): Promise<{ ok: boolean; message?: string }> {
  const cfg = await getMediaConfig();
  const isVideo = file.type.startsWith("video/");
  try {
    if (isVideo) {
      const meta = await readVideoMeta(file);
      const res = validateVideo(
        { ...meta, bytes: file.size, format: extensionOf(file) },
        cfg,
      );
      return res.ok ? { ok: true } : { ok: false, message: res.errors.map((e) => e.message).join(" ") };
    }
    const meta = await readImageMeta(file);
    const res = validateImage({ ...meta, bytes: file.size, format: extensionOf(file) }, cfg);
    return res.ok ? { ok: true } : { ok: false, message: res.errors.map((e) => e.message).join(" ") };
  } catch {
    // If we can't read the file locally, let the server be the judge.
    return { ok: true };
  }
}

function extensionOf(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName) return fromName === "jpg" ? "jpg" : fromName;
  return (file.type.split("/")[1] || "").toLowerCase();
}

function readImageMeta(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable")); };
    img.src = url;
  });
}

function readVideoMeta(file: File): Promise<{ width: number; height: number; durationSeconds: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({ width: video.videoWidth, height: video.videoHeight, durationSeconds: video.duration });
    };
    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable")); };
    video.src = url;
  });
}
