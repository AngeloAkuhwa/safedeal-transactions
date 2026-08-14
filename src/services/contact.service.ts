import { supabase } from "@/integrations/supabase/client";

export type ContactTopic =
  | "general"
  | "transaction"
  | "payment"
  | "dispute"
  | "account"
  | "report_issue";

export interface ContactSubmission {
  full_name: string;
  email: string;
  topic: ContactTopic;
  transaction_reference?: string | null;
  message: string;
}

/** Persists a support message and notifies admins. Throws on failure. */
export const submitContactMessage = async (payload: ContactSubmission): Promise<string> => {
  const { data: { session } } = await supabase.auth.getSession();
  const { data, error } = await supabase.functions.invoke("submit-contact-message", {
    body: payload,
    headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
  });
  if (error) throw new Error(error.message || "Could not send your message");
  if (data?.error) throw new Error(data.error);
  return data.id as string;
};