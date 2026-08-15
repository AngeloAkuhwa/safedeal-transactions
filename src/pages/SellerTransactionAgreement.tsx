import { useParams, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { SellerNav } from "@/components/seller/SellerNav";
import { Footer } from "@/components/landing/Footer";
import { AgreementHero } from "@/components/agreement/AgreementHero";
import { LockedSnapshotCard } from "@/components/agreement/LockedSnapshotCard";
import { ImmutabilityExplanation } from "@/components/agreement/ImmutabilityExplanation";
import { AgreementTrustIndicators } from "@/components/agreement/AgreementTrustIndicators";
import { getAgreementData } from "@/services/agreement.service";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

export default function SellerTransactionAgreement() {
  const { transactionId } = useParams<{ transactionId: string }>();
  const navigate = useNavigate();
  const [sellerName, setSellerName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", session.user.id)
        .single();
      if (data) {
        setSellerName(data.full_name || "Seller");
        setAvatarUrl(data.avatar_url);
      }
    };
    loadProfile();
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["agreement", transactionId],
    queryFn: () => getAgreementData(transactionId!),
    enabled: !!transactionId,
  });

  if (error) {
    return (
      <div className="min-h-[100dvh] bg-background">
        <SellerNav sellerName={sellerName} avatarUrl={avatarUrl} />
        <div className="max-w-4xl mx-auto px-4 py-20 text-center">
          <h2 className="text-2xl font-bold text-foreground mb-4">Unable to Load Agreement</h2>
          <p className="text-muted-foreground mb-6">{(error as Error).message}</p>
          <button
            onClick={() => navigate(-1)}
            className="text-primary font-semibold hover:underline min-h-11 inline-flex items-center"
          >
            Go Back
          </button>
        </div>
        <Footer />
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="min-h-[100dvh] bg-background">
        <SellerNav sellerName={sellerName} avatarUrl={avatarUrl} />
        <div className="max-w-5xl mx-auto px-4 py-16 space-y-8">
          <Skeleton className="h-64 w-full rounded-2xl" />
          <Skeleton className="h-96 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
        <Footer />
      </div>
    );
  }

  const isLocked =
    data.transaction.money_status !== "not_secured" &&
    data.transaction.money_status !== "payment_pending";

  return (
    <div className="min-h-[100dvh] bg-background">
      <SellerNav sellerName={sellerName} avatarUrl={avatarUrl} />
      <AgreementHero isLocked={isLocked} />
      <LockedSnapshotCard data={data} />
      <ImmutabilityExplanation />
      <AgreementTrustIndicators pricing={data.pricing} lockedAt={data.snapshot?.locked_at ?? null} />
      <Footer />
    </div>
  );
}
