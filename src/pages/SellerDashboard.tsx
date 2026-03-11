import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSellerDashboard } from "@/services/seller-dashboard.service";
import { SellerNav } from "@/components/seller/SellerNav";
import { SellerAlertBanners } from "@/components/seller/SellerAlertBanners";
import { SellerDashboardHero } from "@/components/seller/SellerDashboardHero";
import { SellerMetricsCards } from "@/components/seller/SellerMetricsCards";
import { SellerRecentActivity } from "@/components/seller/SellerRecentActivity";
import { SellerQuickActions } from "@/components/seller/SellerQuickActions";
import { SellerTrustBanner } from "@/components/seller/SellerTrustBanner";
import { Footer } from "@/components/landing/Footer";

const SellerDashboard = () => {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["seller-dashboard"],
    queryFn: getSellerDashboard,
    retry: 1,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-success" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 px-4 text-center">
        <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <RefreshCw className="h-7 w-7 text-destructive" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Could not load your dashboard</h2>
        <p className="text-muted-foreground text-sm max-w-md">
          {(error as Error)?.message || "Please refresh or try again later."}
        </p>
        <Button onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
          Try Again
        </Button>
      </div>
    );
  }

  const hasNoTransactions =
    data.metrics.transactions_created_count === 0 &&
    data.recent_activity.length === 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SellerNav
        sellerName={data.seller.full_name}
        avatarUrl={data.seller.avatar_url}
      />

      {/* Unified gradient section: hero + alerts + metrics */}
      <div className="bg-gradient-to-br from-sky-50 via-background to-green-50 dark:from-sky-950/20 dark:via-background dark:to-green-950/20">
        <SellerDashboardHero sellerName={data.seller.full_name} />

        {data.alerts.length > 0 && (
          <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-6">
            <SellerAlertBanners alerts={data.alerts} />
          </section>
        )}

        <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-8">
          <SellerMetricsCards metrics={data.metrics} />
        </section>
      </div>

      <main className="flex-1 bg-muted/30">
        {hasNoTransactions ? (
          <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
            <div className="rounded-2xl border bg-card p-12 text-center">
              <Store className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-foreground mb-2">
                No transactions yet
              </h2>
              <p className="text-muted-foreground text-sm max-w-md mx-auto">
                Create your first protected transaction to start selling securely through SafeDeal.
              </p>
            </div>
          </section>
        ) : (
          <>
            <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
              <SellerRecentActivity activity={data.recent_activity} />
            </section>

            <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-8">
              <SellerQuickActions draftCount={data.quick_actions.draft_count} />
            </section>

            <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-12">
              <SellerTrustBanner />
            </section>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default SellerDashboard;
