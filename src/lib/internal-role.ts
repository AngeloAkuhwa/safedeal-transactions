import { supabase } from "@/integrations/supabase/client";
import { INTERNAL_ROLES } from "@/services/permission-catalog";

const INTERNAL_ROLE_KEYS = INTERNAL_ROLES.map((r) => r.key) as string[];

/**
 * Server-trusted check for whether the given user holds any internal
 * (back-office / team) role. Uses the SECURITY DEFINER RPC so it is
 * immune to RLS races right after sign-in / password set.
 */
export async function isInternalUser(userId: string): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await supabase.rpc("has_any_internal_role", {
    _user_id: userId,
    _role_keys: INTERNAL_ROLE_KEYS,
  });
  if (error) return false;
  return data === true;
}