import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBuyerDashboard } from "@/services/dashboard.service";
import { BuyerNav } from "@/components/dashboard/BuyerNav";
import { DashboardHero } from "@/components/dashboard/DashboardHero";
import { MetricsCards } from "@/components/dashboard/MetricsCards";
import { RecentNotifications } from "@/components/dashboard/RecentNotifications";
import { RecentPurchases } from "@/components/dashboard/RecentPurchases";
import { QuickAccess } from "@/components/dashboard/QuickAccess";
import { Footer } from "@/components/landing/Footer";

const Dashboard = () => {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["buyer-dashboard"],
    queryFn: getBuyerDashboard,
    retry: 1,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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

  const hasNoPurchases =
    data.metrics.active_purchases === 0 &&
    data.recent_purchases.length === 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <BuyerNav
        buyerName={data.buyer.full_name}
        avatarUrl={data.buyer.avatar_url}
      />

      <DashboardHero buyerName={data.buyer.full_name} />

      <main className="flex-1">
        {/* Metrics — overlapping hero */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 -mt-6 mb-8">
          <MetricsCards metrics={data.metrics} />
        </section>

        {hasNoPurchases ? (
          <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mb-12">
            <div className="rounded-2xl border bg-card p-12 text-center">
              <ShoppingBag className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-foreground mb-2">
                You don't have any protected purchases yet
              </h2>
              <p className="text-muted-foreground text-sm max-w-md mx-auto">
                When you make your first secure purchase through SafeDeal, it will appear here with full tracking and protection.
              </p>
            </div>
          </section>
        ) : (
          <>
            <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mb-8">
              <RecentNotifications notifications={data.recent_notifications} />
            </section>

            <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mb-8">
              <RecentPurchases purchases={data.recent_purchases} />
            </section>

            <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mb-12">
              <QuickAccess metrics={data.metrics} />
            </section>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default Dashboard;
