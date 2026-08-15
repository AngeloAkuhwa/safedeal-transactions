import { useQuery } from "@tanstack/react-query";
import { RefreshCw, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBuyerDashboard } from "@/services/dashboard.service";
import { BuyerNav } from "@/components/dashboard/BuyerNav";
import { DashboardHero } from "@/components/dashboard/DashboardHero";
import { MetricsCards } from "@/components/dashboard/MetricsCards";
import { RecentNotifications } from "@/components/dashboard/RecentNotifications";
import { RecentPurchases } from "@/components/dashboard/RecentPurchases";
import { QuickAccess } from "@/components/dashboard/QuickAccess";
import { Footer } from "@/components/landing/Footer";
import { Skeleton } from "@/components/ui/skeleton";

const Dashboard = () => {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["buyer-dashboard"],
    queryFn: getBuyerDashboard,
    retry: (_failureCount, queryError) => {
      const message = queryError instanceof Error ? queryError.message : "";
      return !message.includes("Invalid session") && !message.includes("Not authenticated");
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-background">
        <Skeleton className="h-16 w-full rounded-none" />
        <Skeleton className="h-40 w-full rounded-none" />
        <div className="sd-page space-y-4 py-6"><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}</div><Skeleton className="h-72 rounded-lg" /><Skeleton className="h-48 rounded-lg" /></div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background gap-4 px-4 text-center">
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
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <BuyerNav
        buyerName={data.buyer.full_name}
        avatarUrl={data.buyer.avatar_url}
      />

      <DashboardHero buyerName={data.buyer.full_name} />

      <main className="flex-1 sd-page-y">
        <section className="sd-page mb-4 sd-fade-in-stagger sd-delay-1">
          <MetricsCards metrics={data.metrics} />
        </section>

        {hasNoPurchases ? (
          <section className="sd-page mb-8">
            <div className="rounded-xl border bg-card p-8 text-center">
              <ShoppingBag className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <h2 className="text-base font-semibold text-foreground mb-1">
                You don't have any purchases yet
              </h2>
              <p className="text-muted-foreground text-sm max-w-md mx-auto">
                When you make your first purchase through SafeDeal, its transaction and delivery status will appear here.
              </p>
            </div>
          </section>
        ) : (
          <>
            <section className="sd-page mb-4 sd-fade-in-stagger sd-delay-2">
              <RecentNotifications notifications={data.recent_notifications} />
            </section>

            <section className="sd-page mb-4 sd-fade-in-stagger sd-delay-3">
              <RecentPurchases purchases={data.recent_purchases} />
            </section>

            <section className="sd-page mb-8 sd-fade-in-stagger sd-delay-4">
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
