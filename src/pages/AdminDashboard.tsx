import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { getAdminDashboard, AdminAccessRequiredError } from "@/services/admin-dashboard.service";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { KpiCards } from "@/components/admin/dashboard/KpiCards";
import { AdminActionRequired } from "@/components/admin/dashboard/AdminActionRequired";
import { TrendCharts } from "@/components/admin/dashboard/TrendCharts";
import { OperationalHotspots } from "@/components/admin/dashboard/OperationalHotspots";
import { RiskAndPaymentHealth } from "@/components/admin/dashboard/RiskAndPaymentHealth";
import { IdentityAndPayoutHealth } from "@/components/admin/dashboard/IdentityAndPayoutHealth";
import { AuditComplianceSignalCard } from "@/components/admin/dashboard/AuditComplianceSignal";
import { CriticalAlerts } from "@/components/admin/dashboard/CriticalAlerts";
import { RecentActivity } from "@/components/admin/dashboard/RecentActivity";
import { PerformanceMetrics } from "@/components/admin/dashboard/PerformanceMetrics";
import { Skeleton } from "@/components/ui/skeleton";

const TITLE = "Dashboard Overview";
const SUBTITLE = "Monitor platform operations and key metrics";

function DashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[110px] rounded-xl bg-card" />
        ))}
      </div>
      <Skeleton className="h-[160px] rounded-xl bg-card" />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Skeleton className="h-[300px] rounded-xl bg-card" />
        <Skeleton className="h-[300px] rounded-xl bg-card" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[120px] rounded-xl bg-card" />
        ))}
      </div>
    </>
  );
}

const AdminDashboard = () => {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: getAdminDashboard,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: (count, err) => !(err instanceof AdminAccessRequiredError) && count < 2,
  });

  if (isLoading) {
    return (
      <AdminLayout title={TITLE} subtitle={SUBTITLE}>
        <DashboardSkeleton />
      </AdminLayout>
    );
  }

  if (error instanceof AdminAccessRequiredError) {
    return (
      <AdminLayout title={TITLE} subtitle={SUBTITLE}>
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-card px-6 py-16 text-center">
          <h2 className="text-base font-semibold text-foreground">Admin access required</h2>
          <p className="text-sm text-muted-foreground">You do not have permission to view this dashboard.</p>
        </div>
      </AdminLayout>
    );
  }

  if (isError || !data) {
    return (
      <AdminLayout title={TITLE} subtitle={SUBTITLE}>
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border bg-card px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-400">
            <RefreshCw className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Could not load admin dashboard</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {(error as Error)?.message || "Please try again."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-foreground hover:bg-blue-500 min-h-11"
          >
            <Loader2 className="h-4 w-4" />
            Try Again
          </button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title={TITLE} subtitle={SUBTITLE} badges={data.sidebar_badges}>
      <KpiCards kpis={data.kpis} />
      <AdminActionRequired items={data.action_required} />
      <TrendCharts
        initialTransactions={data.trends.transactions_vs_disputes}
        escrow={data.trends.escrow_releases_refunds}
      />
      <OperationalHotspots items={data.hotspots} />
      <RiskAndPaymentHealth sla={data.dispute_sla} payments={data.payment_health} />
      <IdentityAndPayoutHealth identity={data.identity_health} payout={data.payout_health} />
      <AuditComplianceSignalCard signal={data.audit_signal} />
      <CriticalAlerts alerts={data.critical_alerts} />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <RecentActivity items={data.recent_activity} />
        <PerformanceMetrics metrics={data.performance} />
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;