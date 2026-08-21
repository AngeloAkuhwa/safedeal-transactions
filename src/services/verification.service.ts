import { supabase } from "@/integrations/supabase/client";

async function getAuthHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${session.access_token}` };
}

export interface VerificationData {
  transaction: {
    id: string;
    transaction_code: string;
    status: string;
    money_status: string;
    dispute_status: string;
    delivered_at: string | null;
    verification_deadline_at: string | null;
    created_at: string;
    seller_id: string;
  };
  item: {
    title: string;
    description: string;
    quantity: number;
    condition_label: string;
    brand: string | null;
    model: string | null;
  } | null;
  pricing: {
    currency_code: string;
    item_amount: number;
    platform_fee_amount: number;
    processing_fee_amount: number;
    seller_net_amount: number;
    buyer_total_amount: number;
  } | null;
  agreement: {
    snapshot_json: Record<string, unknown>;
    locked_at: string;
  } | null;
  tracking: {
    courier_name: string | null;
    tracking_number: string | null;
    tracking_url: string | null;
    shipped_at: string | null;
    delivered_at: string | null;
    expected_delivery_at: string | null;
  } | null;
  escrow: {
    state: string;
    held_amount: number;
    frozen_amount: number;
    released_amount: number;
    refunded_amount: number;
  } | null;
  seller: {
    full_name: string;
    avatar_url: string | null;
  } | null;
  timeline: Array<{
    old_status: string | null;
    new_status: string;
    changed_at: string;
    reason: string | null;
  }>;
}

export interface UploadedEvidence {
  file_id: string;
  secure_url: string;
  mime_type: string;
  original_file_name: string | null;
  fingerprint: string;
}

export const getVerificationData = async (transactionId: string): Promise<VerificationData> => {
  const headers = await getAuthHeader();
  const { data, error } = await supabase.functions.invoke("transaction-verify", {
    headers,
    body: { action: "get_verification_data", transactionId },
  });

  // Edge functions returning non-2xx set error on the client; data may contain redirect info
  if (error) {
    // Try to parse the context from the error (supabase-js wraps non-2xx as FunctionsFetchError with context)
    const context = (error as any)?.context;
    if (context && typeof context.json === "function") {
      try {
        const body = await context.json();
        if (body?.redirect) {
          // Expected redirect (e.g. transaction not in verification state). Not a real error
          const redirectError = new Error(body.error || "Transaction is not ready for verification") as any;
          redirectError.redirect = body.redirect;
          redirectError.silent = true;
          throw redirectError;
        }
        if (body?.error) throw new Error(body.error);
      } catch (e) {
        if ((e as any).redirect) throw e;
      }
    }
    throw new Error(error.message || "Failed to load verification data");
  }
  if (data?.error) {
    const err = new Error(data.error) as any;
    if (data.redirect) err.redirect = data.redirect;
    throw err;
  }
  return data as VerificationData;
};

export const confirmReceipt = async (transactionId: string) => {
  const headers = await getAuthHeader();
  const { data, error } = await supabase.functions.invoke("transaction-verify", {
    headers,
    body: { action: "confirm_receipt", transactionId },
  });

  if (error) throw new Error(error.message || "Failed to confirm receipt");
  if (data?.error) throw new Error(data.error);
  return data as { success: boolean; already_confirmed?: boolean; redirect?: string };
};

/**
 * Primary, authenticated buyer delivery-confirmation path.
 * Advances the transaction to delivered_awaiting_verification. The rider OTP
 * link is only a fallback for cash/handoff cases.
 */
export const confirmDelivery = async (transactionId: string) => {
  const headers = await getAuthHeader();
  const { data, error } = await supabase.functions.invoke("transaction-verify", {
    headers,
    body: { action: "confirm_delivery", transactionId },
  });

  if (error) throw new Error(error.message || "Failed to confirm delivery");
  if (data?.error) throw new Error(data.error);
  return data as {
    success: boolean;
    already_delivered?: boolean;
    delivered_at?: string;
    verification_window_hours?: number;
    message?: string;
  };
};

async function computeSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function detectFileSignature(file: File): Promise<"jpeg" | "png" | "pdf" | "mp4" | "unknown"> {
  const buf = await file.slice(0, 16).arrayBuffer();
  const bytes = new Uint8Array(buf);

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf";
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return "mp4";

  return "unknown";
}

export const uploadEvidence = async (
  file: File,
  onProgress?: (pct: number) => void,
): Promise<UploadedEvidence> => {
  const headers = await getAuthHeader();

  // 0. Validate real file type via magic bytes
  const fileSig = await detectFileSignature(file);
  if (fileSig === "unknown") {
    throw new Error("Unsupported or suspicious file type. Allowed: JPEG, PNG, PDF, MP4");
  }

  // 1. Compute SHA-256 hash
  const fileHash = await computeSha256(file);

  // 2. Get signed upload params
  const { data: signData, error: signErr } = await supabase.functions.invoke("upload-evidence", {
    headers,
    body: { action: "sign_upload" },
  });

  if (signErr) throw new Error(signErr.message || "Failed to get upload signature");
  if (signData?.error) throw new Error(signData.error);

  const { timestamp, signature, api_key, cloud_name, folder } = signData;

  // 3. Upload directly to Cloudinary via XHR for progress tracking
  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", api_key);
  formData.append("timestamp", String(timestamp));
  formData.append("signature", signature);
  formData.append("folder", folder);

  const cloudinaryRes: Record<string, unknown> = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${cloud_name}/auto/upload`);

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch { reject(new Error("Invalid Cloudinary response")); }
      } else {
        reject(new Error(`Cloudinary upload failed: ${xhr.responseText}`));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(formData);
  });

  // 4. Register file in database
  const { data: regData, error: regErr } = await supabase.functions.invoke("upload-evidence", {
    headers,
    body: {
      action: "register_file",
      public_id: cloudinaryRes.public_id,
      asset_id: cloudinaryRes.asset_id,
      secure_url: cloudinaryRes.secure_url,
      bytes: cloudinaryRes.bytes,
      format: cloudinaryRes.format,
      resource_type: cloudinaryRes.resource_type,
      original_filename: cloudinaryRes.original_filename,
      file_hash: fileHash,
      hash_algorithm: "sha256",
    },
  });

  if (regErr) throw new Error(regErr.message || "Failed to register file");
  if (regData?.error) throw new Error(regData.error);

  return regData as UploadedEvidence;
};

export const raiseDispute = async (
  transactionId: string,
  reason: string,
  description: string,
  fileIds?: string[],
) => {
  const headers = await getAuthHeader();
  const { data, error } = await supabase.functions.invoke("transaction-verify", {
    headers,
    body: { action: "raise_dispute", transactionId, reason, description, fileIds },
  });

  if (error) throw new Error(error.message || "Failed to raise dispute");
  if (data?.error) throw new Error(data.error);
  return data as { success: boolean; dispute_id: string; redirect: string };
};
