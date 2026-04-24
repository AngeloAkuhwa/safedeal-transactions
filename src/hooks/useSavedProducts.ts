import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthState } from "@/hooks/useAuthState";

export { useAuthState } from "@/hooks/useAuthState";

const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const baseUrl = `https://${projectId}.supabase.co/functions/v1/saved-products`;
const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  return {
    "Content-Type": "application/json",
    apikey,
    Authorization: `Bearer ${session.access_token}`,
  };
}

async function clearLocalSession() {
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
}

async function safeJson<T>(res: Response, fallback: T): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

// Fetch all saved products (enriched)
export function useSavedProducts() {
  const { isAuthenticated, loading } = useAuthState();
  return useQuery({
    queryKey: ["saved-products"],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      if (!headers) return { items: [], count: 0 };
      const res = await fetch(baseUrl, { headers });
      if (res.status === 401 || res.status === 403) {
        await clearLocalSession();
        return { items: [], count: 0 };
      }
      if (!res.ok) throw new Error("Failed to load saved products");
      return safeJson(res, { items: [], count: 0 });
    },
    enabled: isAuthenticated && !loading,
    staleTime: 30_000,
    retry: false,
  });
}

// Fetch saved product IDs for heart rendering
export function useSavedProductIds() {
  const { isAuthenticated, loading } = useAuthState();
  return useQuery({
    queryKey: ["saved-product-ids"],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      if (!headers) return [] as string[];
      const res = await fetch(`${baseUrl}?ids_only=true`, { headers });
      if (res.status === 401 || res.status === 403) {
        await clearLocalSession();
        return [] as string[];
      }
      if (!res.ok) return [] as string[];
      const data = await safeJson<{ product_ids?: string[] }>(res, { product_ids: [] });
      return (data.product_ids || []) as string[];
    },
    enabled: isAuthenticated && !loading,
    staleTime: 30_000,
    retry: false,
  });
}

// Check if a single product is saved
export function useIsProductSaved(productId: string | undefined) {
  const { isAuthenticated, loading } = useAuthState();
  return useQuery({
    queryKey: ["saved-product-check", productId],
    queryFn: async () => {
      if (!productId) return false;
      const headers = await getAuthHeaders();
      if (!headers) return false;
      const res = await fetch(`${baseUrl}?check=${productId}`, { headers });
      if (res.status === 401 || res.status === 403) {
        await clearLocalSession();
        return false;
      }
      if (!res.ok) return false;
      const data = await safeJson<{ saved?: boolean }>(res, { saved: false });
      return data.saved as boolean;
    },
    enabled: !!productId && isAuthenticated && !loading,
    staleTime: 30_000,
    retry: false,
  });
}

// Toggle save/unsave mutation
export function useToggleSave() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ productId, saved }: { productId: string; saved: boolean }) => {
      const headers = await getAuthHeaders();
      if (!headers) throw new Error("Not authenticated");
      const res = await fetch(baseUrl, {
        method: saved ? "DELETE" : "POST",
        headers,
        body: JSON.stringify({ product_id: productId }),
      });
      if (res.status === 401 || res.status === 403) {
        await clearLocalSession();
        throw new Error("Not authenticated");
      }
      if (!res.ok) throw new Error("Failed to toggle save");
      return safeJson(res, { saved: !saved });
    },
    onMutate: async ({ productId, saved }) => {
      // Optimistic update for ids list
      await queryClient.cancelQueries({ queryKey: ["saved-product-ids"] });
      const prev = queryClient.getQueryData<string[]>(["saved-product-ids"]) || [];
      queryClient.setQueryData<string[]>(
        ["saved-product-ids"],
        saved ? prev.filter((id) => id !== productId) : [...prev, productId]
      );
      // Optimistic update for single check
      queryClient.setQueryData(["saved-product-check", productId], !saved);
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(["saved-product-ids"], context.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-product-ids"] });
      queryClient.invalidateQueries({ queryKey: ["saved-products"] });
      queryClient.invalidateQueries({ queryKey: ["saved-product-check"] });
    },
  });
}


