import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BuyerDashboardResponse } from "@/services/dashboard.service";

async function fetchIdentity() {
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .single();
  if (error) throw error;
  return data;
}

export function useBuyerIdentity() {
  const queryClient = useQueryClient();
  const cached = queryClient.getQueryData<BuyerDashboardResponse>(["buyer-dashboard"]);

  const { data: profile } = useQuery({
    queryKey: ["buyer-identity"],
    queryFn: fetchIdentity,
    enabled: !cached?.buyer?.full_name,
    staleTime: 5 * 60_000,
  });

  return {
    buyerName: cached?.buyer?.full_name || profile?.full_name || "User",
    avatarUrl: cached?.buyer?.avatar_url || profile?.avatar_url || null,
  };
}
