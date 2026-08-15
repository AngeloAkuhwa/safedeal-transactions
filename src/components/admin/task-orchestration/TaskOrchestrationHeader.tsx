import { Bell, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router";
import { cn } from "@/lib/utils";

export function TaskOrchestrationHeader({
  autoAssignActive, onExport, unread = 0,
}: { autoAssignActive: boolean; onExport: () => void; unread?: number }) {
  return (
    <div className="sticky top-0 z-sticky border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 lg:px-8">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground lg:text-2xl">
            Task Orchestration &amp; Agent Load Management
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Senior admin workforce control · Real-time assignment operations
          </p>
        </div>
        <div className="flex items-center gap-2 lg:gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1.5 text-xs backdrop-blur-sm">
            <span className={cn("h-1.5 w-1.5 rounded-full", autoAssignActive ? "bg-emerald-400 sd-live-dot" : "bg-muted-foreground")} />
            <span className="text-muted-foreground">Auto-Assign:</span>
            <span className={cn("font-semibold", autoAssignActive ? "text-emerald-300" : "text-muted-foreground")}>
              {autoAssignActive ? "Active" : "Off"}
            </span>
          </div>
          <Link
            to="/admin/notifications"
            className="relative hidden h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-card/60 text-muted-foreground transition-colors hover:text-foreground lg:inline-flex before:absolute before:-inset-2 before:content-['']"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unread > 0 && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-rose-400" />}
          </Link>
          <Button onClick={onExport} size="sm" className="rounded-full">
            <Download className="mr-2 h-4 w-4" /> Export Report
          </Button>
        </div>
      </div>
    </div>
  );
}