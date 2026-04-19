// Inline structured error logger for edge functions.
// Best-effort: never throws, never blocks request flow.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export interface EdgeErrorPayload {
  function_name: string;
  user_id?: string | null;
  error_code?: string | null;
  message: string;
  http_status?: number | null;
  request_context?: Record<string, unknown> | null;
}

export async function logEdgeError(
  admin: ReturnType<typeof createClient>,
  payload: EdgeErrorPayload,
): Promise<void> {
  try {
    await admin.from("edge_function_errors").insert({
      function_name: payload.function_name,
      user_id: payload.user_id ?? null,
      error_code: payload.error_code ?? null,
      message: payload.message,
      http_status: payload.http_status ?? null,
      request_context: payload.request_context ?? null,
    });
  } catch (e) {
    console.error(`[logEdgeError] failed to log:`, e);
  }
}
