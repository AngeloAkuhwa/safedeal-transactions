import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Resolves a dispute id to its underlying transaction and forwards to the
 * existing admin transaction detail page with the dispute tab pre-selected.
 */
export default function AdminDisputeRedirect() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    async function go() {
      if (!id) {
        navigate("/admin/disputes", { replace: true });
        return;
      }
      const { data, error } = await supabase
        .from("disputes")
        .select("transaction_id")
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data?.transaction_id) {
        navigate("/admin/disputes", { replace: true });
        return;
      }
      navigate(
        `/admin/transactions/${data.transaction_id}?tab=dispute&disputeId=${id}`,
        { replace: true },
      );
    }
    void go();
    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
      Opening dispute…
    </div>
  );
}