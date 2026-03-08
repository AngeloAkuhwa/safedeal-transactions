import { supabase } from "@/integrations/supabase/client";

export const getProfile = async (userId: string) => {
  return supabase
    .from("profiles")
    .select("full_name, default_role, email, phone, avatar_url")
    .eq("id", userId)
    .single();
};
