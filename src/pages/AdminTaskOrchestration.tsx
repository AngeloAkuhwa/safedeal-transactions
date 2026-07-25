import { AdminLayout } from "@/components/admin/AdminLayout";
import { ComingSoonPanel } from "@/components/admin/ComingSoonPanel";

export default function AdminTaskOrchestration() {
  return (
    <AdminLayout title="Task orchestration" subtitle="Assign and rebalance operational workloads">
      <ComingSoonPanel
        module="Task Orchestration"
        description="Route disputes, verifications and payouts to the right agent, monitor SLAs, and rebalance work when someone is unavailable."
        planned={[
          "Queue view with SLA countdowns",
          "Bulk reassignment when suspending or off-boarding a user",
          "Auto-routing rules by dispute category and region",
        ]}
      />
    </AdminLayout>
  );
}