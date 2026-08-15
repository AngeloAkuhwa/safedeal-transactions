import { useParams, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { BuyerNav } from "@/components/dashboard/BuyerNav";
import { Footer } from "@/components/landing/Footer";
import { AgreementHero } from "@/components/agreement/AgreementHero";
import { LockedSnapshotCard } from "@/components/agreement/LockedSnapshotCard";
import { ImmutabilityExplanation } from "@/components/agreement/ImmutabilityExplanation";
import { AgreementNextSteps } from "@/components/agreement/AgreementNextSteps";
import { AgreementTrustIndicators } from "@/components/agreement/AgreementTrustIndicators";
import { getAgreementData } from "@/services/agreement.service";
import { getBuyerProfile } from "@/services/profile.service";
import { Skeleton } from "@/components/ui/skeleton";

export default function BuyerTransactionAgreement() {
  const { transactionId } = useParams<{ transactionId: string }>();
  const navigate = useNavigate();

  const { data: profile } = useQuery({
    queryKey: ["buyer-profile"],
    queryFn: getBuyerProfile,
  });

  const buyerName = profile?.profile.full_name || "";
  const avatarUrl = profile?.profile.avatar_url || null;

  const { data, isLoading, error } = useQuery({
    queryKey: ["agreement", transactionId],
    queryFn: () => getAgreementData(transactionId!),
    enabled: !!transactionId,
  });

  if (error) {
    return (
      <div className="min-h-[100dvh] bg-background">
        <BuyerNav buyerName={buyerName} avatarUrl={avatarUrl} />
        <div className="max-w-4xl mx-auto px-4 py-20 text-center">
          <h2 className="text-2xl font-bold text-foreground mb-4">Unable to Load Agreement</h2>
          <p className="text-muted-foreground mb-6">{(error as Error).message}</p>
          <button
            onClick={() => navigate("/dashboard/transactions")}
            className="text-primary font-semibold hover:underline"
          >
            Back to Transactions
          </button>
        </div>
        <Footer />
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="min-h-[100dvh] bg-background">
        <BuyerNav buyerName={buyerName} avatarUrl={avatarUrl} />
        <div className="max-w-5xl mx-auto px-4 py-16 space-y-8">
          <Skeleton className="h-64 w-full rounded-2xl" />
          <Skeleton className="h-96 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
        <Footer />
      </div>
    );
  }

  const isLocked = data.transaction.money_status !== "not_secured" && data.transaction.money_status !== "payment_pending";

  return (
    <div className="min-h-[100dvh] bg-background">
      <BuyerNav buyerName={buyerName} avatarUrl={avatarUrl} />
      <AgreementHero isLocked={isLocked} />
      <LockedSnapshotCard data={data} />
      <ImmutabilityExplanation />
      <AgreementNextSteps transactionId={transactionId!} />
      <AgreementTrustIndicators pricing={data.pricing} lockedAt={data.snapshot?.locked_at ?? null} />
      <Footer />
    </div>
  );
}
