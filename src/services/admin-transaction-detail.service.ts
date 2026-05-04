import { supabase } from "@/integrations/supabase/client";

export class AdminAccessRequiredError extends Error {
  constructor() { super("Admin access required"); this.name = "AdminAccessRequiredError"; }
}
export class TransactionNotFoundError extends Error {
  constructor() { super("Transaction not found"); this.name = "TransactionNotFoundError"; }
}

export interface AdminTxParty {
  id: string;
  name: string | null;
  storeSlug?: string | null;
  avatarUrl: string | null;
  maskedEmail: string | null;
  maskedPhone: string | null;
  flagged: boolean;
  accountStatus: string | null;
  verification: {
    level: string;
    identity: boolean;
    email: boolean;
    phone: boolean;
    payout: boolean;
  } | null;
}
export interface AdminTxItem {
  id: string;
  title: string;
  description: string | null;
  condition: string | null;
  quantity: number;
  brand: string | null;
  model: string | null;
  warrantyInfo: string | null;
  unitPrice: number | null;
  lineTotal: number | null;
  image: string | null;
  productId: string | null;
}
export interface AdminTxLedgerEntry {
  id: string; at: string; entryType: string; amount: number | null;
  currency: string | null; balanceAfter: number | null;
  referenceType: string | null; referenceId: string | null; notes: string | null;
}
export interface AdminTxTimelineItem {
  id: string; at: string; type: string; title: string; description: string;
  actorType: string | null; actorName: string | null; severity: string; icon: string;
}
export interface AdminTxLinkedRecord {
  type: string; label: string; subtitle?: string | null; status?: string | null;
  amount?: number | null; currency?: string | null; route?: string | null;
}
export interface AdminTxEvidenceItem {
  id: string;
  kind: "image" | "video" | "document" | "receipt" | "delivery_proof" | "screenshot" | string;
  title: string;
  secureUrl: string | null;
  mimeType: string | null;
  evidenceType: string | null;
  uploadedByRole: string | null;
  uploadedByName: string | null;
  uploadedAt: string;
  status: "pending" | "reviewed" | "verified" | "rejected" | "flagged" | string;
  note: string | null;
}
export interface AdminTxLockedAgreement {
  lockedAt: string | null;
  transactionCode: string | null;
  buyerName: string | null;
  sellerName: string | null;
  item: { title: string | null; description: string | null; condition: string | null; quantity: number | null };
  agreedPrice: number | null;
  protectionFee: number | null;
  total: number | null;
  currency: string;
  deliveryMethod: string | null;
  verificationWindowHours: number | null;
  sellerNotes: string | null;
  buyerNotes: string | null;
  rules: any;
  hash: string | null;
  version: string | null;
  snapshot: any;
}
export interface AdminTxDetailResponse {
  transaction: any;
  parties: { buyer: AdminTxParty | null; seller: AdminTxParty | null };
  items: AdminTxItem[];
  pricing: any | null;
  payment: any | null;
  escrow: { ledger: AdminTxLedgerEntry[]; [k: string]: any } | null;
  payout: any | null;
  delivery: any;
  dispute: any | null;
  timeline: AdminTxTimelineItem[];
  risk: any;
  linkedRecords: AdminTxLinkedRecord[];
  adminActionsAvailable: Record<string, boolean>;
  evidence?: AdminTxEvidenceItem[];
  lockedAgreement?: AdminTxLockedAgreement | null;
}

export async function getAdminTransactionDetailFull(
  transactionId: string,
): Promise<AdminTxDetailResponse> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;
  if (!session) {
    if (typeof window !== "undefined") window.location.replace("/auth");
    return new Promise(() => {}) as never;
  }
  const { data, error } = await supabase.functions.invoke<AdminTxDetailResponse>(
    "admin-transaction-detail",
    {
      body: { transaction_id: transactionId },
      headers: { Authorization: `Bearer ${session.access_token}` },
    },
  );
  if (error) {
    const ctx = (error as unknown as { context?: Response }).context;
    if (ctx?.status === 403) throw new AdminAccessRequiredError();
    if (ctx?.status === 404) throw new TransactionNotFoundError();
    let msg = error.message;
    try {
      const body = ctx ? await ctx.clone().json() : null;
      if (body?.error === "transaction_not_found") throw new TransactionNotFoundError();
      if (body?.error === "admin_access_required") throw new AdminAccessRequiredError();
      if (body?.error) msg = body.error;
    } catch (e) {
      if (e instanceof AdminAccessRequiredError || e instanceof TransactionNotFoundError) throw e;
    }
    throw new Error(msg ?? "Failed to load transaction");
  }
  if (!data) throw new Error("Empty response");
  return data;
}
