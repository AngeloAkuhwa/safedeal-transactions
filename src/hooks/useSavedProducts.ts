import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

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

// Fetch all saved products (enriched)
export function useSavedProducts() {
  const { isAuthenticated } = useAuthState();
  return useQuery({
    queryKey: ["saved-products"],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      if (!headers) return { items: [], count: 0 };
      const res = await fetch(baseUrl, { headers });
      if (res.status === 401) return { items: [], count: 0 };
      if (!res.ok) throw new Error("Failed to load saved products");
      return res.json() as Promise<{ items: any[]; count: number }>;
    },
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
}

// Fetch saved product IDs for heart rendering
export function useSavedProductIds() {
  const { isAuthenticated } = useAuthState();
  return useQuery({
    queryKey: ["saved-product-ids"],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      if (!headers) return [] as string[];
      const res = await fetch(`${baseUrl}?ids_only=true`, { headers });
      if (!res.ok) return [] as string[];
      const data = await res.json();
      return (data.product_ids || []) as string[];
    },
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
}

// Check if a single product is saved
export function useIsProductSaved(productId: string | undefined) {
  const { isAuthenticated } = useAuthState();
  return useQuery({
    queryKey: ["saved-product-check", productId],
    queryFn: async () => {
      if (!productId) return false;
      const headers = await getAuthHeaders();
      if (!headers) return false;
      const res = await fetch(`${baseUrl}?check=${productId}`, { headers });
      if (!res.ok) return false;
      const data = await res.json();
      return data.saved as boolean;
    },
    enabled: !!productId && isAuthenticated,
    staleTime: 30_000,
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
      if (!res.ok) throw new Error("Failed to toggle save");
      return res.json();
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

// Hook to check auth state for gating
export function useAuthState() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { isAuthenticated, loading };
}
