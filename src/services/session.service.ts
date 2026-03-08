import { supabase } from "@/integrations/supabase/client";

export const invalidateOldSessions = async (userId: string) => {
  return supabase.rpc("invalidate_old_sessions", { _user_id: userId });
};

export const createSession = async (userId: string, accessToken: string) => {
  return supabase.from("user_sessions").insert({
    user_id: userId,
    session_token_hash: accessToken.slice(-32),
    is_active: true,
  });
};
