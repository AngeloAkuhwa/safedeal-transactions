import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fetches the current admin's effective permission set from the
 * `internal_effective_permissions` RPC. Falls back to an empty set when the
 * user isn't an internal user or the call errors. Callers should treat
 * an unknown permission as "not allowed".
 */
export function useInternalPermissions() {
  return useQuery({
    queryKey: ["internal-effective-permissions"],
    staleTime: 60_000,
    queryFn: async (): Promise<Set<string>> => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return new Set();
      const { data, error } = await supabase.rpc("internal_effective_permissions", { _user_id: uid });
      if (error) return new Set();
      const rows = Array.isArray(data) ? data : [];
      const keys = rows
        .map((r: unknown) =>
          typeof r === "string"
            ? r
            : r && typeof r === "object" && "permission_key" in r
              ? String((r as { permission_key: unknown }).permission_key)
              : null,
        )
        .filter((k): k is string => !!k);
      return new Set(keys);
    },
  });
}

export function canPerform(perms: Set<string> | undefined, key: string): boolean {
  return !!perms && perms.has(key);
}