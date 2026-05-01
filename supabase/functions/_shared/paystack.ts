const PAYSTACK_BASE = "https://api.paystack.co";

function secret(): string {
  const k = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!k) throw new Error("PAYSTACK_SECRET_KEY missing");
  return k;
}

export interface PaystackResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  message?: string;
  raw: unknown;
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<PaystackResult<T>> {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return {
    ok: res.ok && json?.status === true,
    status: res.status,
    data: json?.data as T | undefined,
    message: json?.message,
    raw: json,
  };
}

export interface TransferRecipientInput {
  type: "nuban";
  name: string;
  account_number: string;
  bank_code: string;
  currency: "NGN";
}

export interface TransferRecipientData {
  recipient_code: string;
  id?: number | string;
  active?: boolean;
}

export function createTransferRecipient(input: TransferRecipientInput) {
  return post<TransferRecipientData>("/transferrecipient", input as unknown as Record<string, unknown>);
}

export interface TransferInput {
  source: "balance";
  amount: number;       // kobo
  recipient: string;    // recipient_code
  reason: string;
  reference: string;    // stable, deterministic
}

export interface TransferData {
  reference: string;
  transfer_code: string;
  status: string;
  amount: number;
}

export function createTransfer(input: TransferInput) {
  return post<TransferData>("/transfer", input as unknown as Record<string, unknown>);
}

export interface RefundInput {
  transaction: string; // original payments.provider_reference
  amount?: number;     // kobo, optional for full refund
  customer_note?: string;
  merchant_note?: string;
}

export interface RefundData {
  id: number | string;
  status: string;
  transaction?: { reference: string };
}

export function createRefund(input: RefundInput) {
  return post<RefundData>("/refund", input as unknown as Record<string, unknown>);
}

/**
 * HMAC-SHA512 verification against the raw request body.
 */
export async function verifyWebhookSignature(rawBody: string, signature: string): Promise<boolean> {
  if (!signature) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(hex, signature);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}