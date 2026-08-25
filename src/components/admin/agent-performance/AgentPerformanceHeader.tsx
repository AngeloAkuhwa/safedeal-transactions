import { Bell, Download } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AgentPerformanceHeader({
  liveAgents, onExport, canExport, unread = 0,
}: {
  liveAgents: number;
  onExport: () => void;
  canExport: boolean;
  unread?: number;
}) {
  const navigate = useNavigate();
  return (
    <div className="sticky top-0 z-sticky border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 lg:px-8">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground lg:text-2xl">Agent Performance &amp; Dispute Operations</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Performance tracking · Workload management
          </p>
        </div>
        <div className="flex items-center gap-2 lg:gap-3">
          <div
            className="hidden items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1.5 text-xs backdrop-blur-sm lg:inline-flex"
            aria-live="polite"
            aria-atomic="true"
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", liveAgents > 0 ? "bg-emerald-400 sd-live-dot" : "bg-muted-foreground")} />
            <span className="text-muted-foreground">Live:</span>
            <span className={cn("font-semibold", liveAgents > 0 ? "text-emerald-300" : "text-muted-foreground")}>
              {liveAgents} {liveAgents === 1 ? "Agent" : "Agents"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => navigate("/admin/notifications")}
            className="relative hidden h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-card/60 text-muted-foreground transition-colors hover:text-foreground lg:inline-flex before:absolute before:-inset-2 before:content-['']"
            aria-label={unread > 0 ? `Open notifications, ${unread} unread` : "Open notifications"}
            title="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-rose-400" aria-hidden="true" />
            )}
          </button>
          <Button
            onClick={onExport}
            size="sm"
            className="rounded-full"
            disabled={!canExport}
            title={canExport ? "Export performance report" : "You do not have export permission"}
          >
            <Download className="mr-2 h-4 w-4" /> Export Report
          </Button>
        </div>
      </div>
    </div>
  );
}