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

  if (error) throw new Error(error.message || "Failed to load verification data");
  if (data?.error) throw new Error(data.error);
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

async function computeSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const uploadEvidence = async (file: File): Promise<UploadedEvidence> => {
  const headers = await getAuthHeader();

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

  // 3. Upload directly to Cloudinary
  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", api_key);
  formData.append("timestamp", String(timestamp));
  formData.append("signature", signature);
  formData.append("folder", folder);

  const uploadRes = await fetch(
    `https://api.cloudinary.com/v1_1/${cloud_name}/auto/upload`,
    { method: "POST", body: formData },
  );

  if (!uploadRes.ok) {
    const errBody = await uploadRes.text();
    throw new Error(`Cloudinary upload failed: ${errBody}`);
  }

  const cloudinaryRes = await uploadRes.json();

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
