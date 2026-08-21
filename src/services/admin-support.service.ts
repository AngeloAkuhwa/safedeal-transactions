/**
 * Support inbox: reads `contact_messages` under RLS (internal admins only)
 * and routes every mutation through the permission-gated, audited edge function.
 */
import { supabase } from "@/integrations/supabase/client";

export type SupportStatus = "new" | "in_progress" | "resolved";

export interface SupportMessage {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  topic: string;
  transaction_reference: string | null;
  message: string;
  status: string;
  handled_by: string | null;
  handled_at: string | null;
  admin_reply: string | null;
  replied_at: string | null;
  reply_channel: string | null;
  created_at: string;
}

export interface SupportInboxPage {
  messages: SupportMessage[];
  total: number;
  counts: Record<SupportStatus, number>;
}

const PAGE_SIZE = 20;

export async function fetchSupportInbox(
  status: SupportStatus,
  page = 1,
  search = "",
): Promise<SupportInboxPage> {
  const from = (page - 1) * PAGE_SIZE;
  let query = supabase
    .from("contact_messages")
    .select("*", { count: "exact" })
    .eq("status", status)
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  const term = search.trim();
  if (term) {
    query = query.or(
      `email.ilike.%${term}%,full_name.ilike.%${term}%,transaction_reference.ilike.%${term}%`,
    );
  }

  const [{ data, error, count }, counts] = await Promise.all([query, fetchStatusCounts()]);
  if (error) throw new Error(error.message);

  return {
    messages: (data ?? []) as SupportMessage[],
    total: count ?? 0,
    counts,
  };
}

async function fetchStatusCounts(): Promise<Record<SupportStatus, number>> {
  const statuses: SupportStatus[] = ["new", "in_progress", "resolved"];
  const results = await Promise.all(
    statuses.map((s) =>
      supabase
        .from("contact_messages")
        .select("id", { count: "exact", head: true })
        .eq("status", s),
    ),
  );
  return {
    new: results[0].count ?? 0,
    in_progress: results[1].count ?? 0,
    resolved: results[2].count ?? 0,
  };
}

export interface SupportActionResult {
  emailed: boolean;
  channel: string;
}

export async function actOnSupportMessage(input: {
  id: string;
  action: "claim" | "reply" | "resolve" | "reopen";
  reply?: string;
}): Promise<SupportActionResult> {
  const { data: { session } } = await supabase.auth.getSession();
  const { data, error } = await supabase.functions.invoke("admin-reply-contact-message", {
    body: input,
    headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
  });
  if (error) throw new Error(error.message || "Action failed");
  if (data?.error) throw new Error(data.error);
  return { emailed: Boolean(data.emailed), channel: String(data.channel ?? "none") };
}

export const SUPPORT_SIZE = PAGE_SIZE;
