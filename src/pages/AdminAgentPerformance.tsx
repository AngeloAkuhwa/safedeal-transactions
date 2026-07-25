import { AdminLayout } from "@/components/admin/AdminLayout";
import { ComingSoonPanel } from "@/components/admin/ComingSoonPanel";

export default function AdminAgentPerformance() {
  return (
    <AdminLayout title="Agent performance" subtitle="Throughput, SLA hit-rate and quality metrics per agent">
      <ComingSoonPanel
        module="Agent Performance"
        description="Per-agent scorecards, dispute resolution time, verification throughput and quality signals — with drill-down back to individual cases."
        planned={[
          "Weekly SLA and quality scorecards",
          "Comparative team leaderboards",
          "Alerts when an agent trends outside their peer band",
        ]}
      />
    </AdminLayout>
  );
}