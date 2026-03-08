import { supabase } from "@/integrations/supabase/client";

export type SelectableRole = "buyer" | "seller";

export const getUserRoles = async (userId: string) => {
  return supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
};

export const checkRoleExists = async (userId: string, role: SelectableRole) => {
  return supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", role);
};

export const assignRole = async (userId: string, role: SelectableRole) => {
  const { error: roleError } = await supabase
    .from("user_roles")
    .insert({ user_id: userId, role, is_primary: true });

  if (roleError) {
    return { success: false as const, error: roleError.message };
  }

  await supabase
    .from("profiles")
    .update({ default_role: role })
    .eq("id", userId);

  return { success: true as const, error: null };
};
