import { supabase } from "@/integrations/supabase/client";

export interface UploadedDeliveryFile {
  file_id: string;
  secure_url: string;
  original_name: string;
  mime_type: string;
  fingerprint: string;
}

async function getAuthHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${session.access_token}` };
}

async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = new Uint8Array(hashBuffer);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

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
      return bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
    default:
      return true;
  }
}

async function uploadEvidenceCore(
  file: File,
  context: "delivery_proof" | "dispatch_evidence",
  onProgress?: (pct: number) => void,
): Promise<UploadedDeliveryFile> {
  const buffer = await file.arrayBuffer();
  if (!validateMagicBytes(buffer, file.type)) {
    throw new Error("File content doesn't match its type. Please upload a valid file.");
  }

  const isVideo = file.type.startsWith("video/");
  const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new Error(`File exceeds ${isVideo ? "50MB" : "10MB"} limit`);
  }

  const headers = await getAuthHeader();
  // Backend currently signs for delivery_proof context; reuse for both since storage path is the same
  const { data: signData, error: signErr } = await supabase.functions.invoke("upload-evidence", {
    headers,
    body: { action: "sign_upload", context: "delivery_proof" },
  });
  if (signErr || !signData || signData.error) {
    throw new Error(signData?.error || "Failed to get upload signature");
  }

  const { timestamp, signature, api_key, cloud_name, folder } = signData;
  const fileHash = await computeFileHash(file);
  const resourceType = isVideo ? "video" : "image";
  const uploadUrl = `https://api.cloudinary.com/v1_1/${cloud_name}/${resourceType}/upload`;

  const formDataUpload = new FormData();
  formDataUpload.append("file", file);
  formDataUpload.append("api_key", api_key);
  formDataUpload.append("timestamp", String(timestamp));
  formDataUpload.append("signature", signature);
  formDataUpload.append("folder", folder);

  const cloudinaryResult = await new Promise<Record<string, unknown>>((resolve, reject) => {
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
      context_type: context,
    },
  });

  if (regErr || !regData || regData.error) {
    throw new Error(regData?.error || "Failed to register file");
  }

  return {
    file_id: regData.file_id,
    secure_url: regData.secure_url,
    original_name: file.name,
    mime_type: regData.mime_type,
    fingerprint: regData.fingerprint,
  };
}

/** Upload a delivery (delivered-status) evidence file */
export function uploadDeliveryEvidence(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<UploadedDeliveryFile> {
  return uploadEvidenceCore(file, "delivery_proof", onProgress);
}

/** Upload a dispatch-time evidence file (courier receipt, package photo at dispatch) */
export function uploadDispatchEvidence(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<UploadedDeliveryFile> {
  return uploadEvidenceCore(file, "dispatch_evidence", onProgress);
}

export interface UpdateDeliveryStatusPayload {
  transactionId: string;
  action: "processing" | "dispatched" | "delivered";
  trackingNumber?: string | null;
  deliveryNotes?: string | null;
  fileIds?: string[];
  // Method-aware optional fields
  courierName?: string | null;
  trackingUrl?: string | null;
  dispatchNote?: string | null;
  dispatchEvidenceFileIds?: string[];
  scheduledHandoffAt?: string | null;
  pickupReadyAt?: string | null;
  riderName?: string | null;
  riderPhone?: string | null;
  handoffCodeInput?: string | null;
}

export interface UpdateDeliveryStatusResult {
  success: boolean;
  new_status: string;
  delivered_at?: string | null;
  verification_deadline_at?: string | null;
  handoff_code?: string | null;
}

export async function updateDeliveryStatus(
  payload: UpdateDeliveryStatusPayload,
): Promise<UpdateDeliveryStatusResult> {
  const headers = await getAuthHeader();
  const { data, error } = await supabase.functions.invoke("update-delivery-status", {
    headers,
    body: {
      transaction_id: payload.transactionId,
      action: payload.action,
      tracking_number: payload.trackingNumber || null,
      delivery_notes: payload.deliveryNotes || null,
      file_ids: payload.fileIds || [],
      courier_name: payload.courierName || null,
      tracking_url: payload.trackingUrl || null,
      dispatch_note: payload.dispatchNote || null,
      dispatch_evidence_file_ids: payload.dispatchEvidenceFileIds || [],
      scheduled_handoff_at: payload.scheduledHandoffAt || null,
      pickup_ready_at: payload.pickupReadyAt || null,
      rider_name: payload.riderName || null,
      rider_phone: payload.riderPhone || null,
      handoff_code_input: payload.handoffCodeInput || null,
    },
  });

  if (error) throw new Error(error.message || "Failed to update delivery status");
  if (!data || data.error) throw new Error(data?.error || "Failed to update delivery status");
  return data;
}
