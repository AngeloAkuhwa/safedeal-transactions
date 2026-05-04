import { Filter, Download } from "lucide-react";
import { useAdminNav } from "./useAdminNav";
import { AdminReadingModeControl } from "./AdminReadingModeControl";

interface AdminHeaderProps {
  title: string;
  subtitle?: string;
}

export function AdminHeader({ title, subtitle }: AdminHeaderProps) {
  const { go } = useAdminNav();
  return (
    <div className="sticky top-0 z-30 hidden border-b border-border bg-background/85 backdrop-blur lg:block">
      <div className="flex items-start justify-between gap-4 px-8 py-5">
        <div>
          <h1 className="text-xl font-semibold leading-tight text-foreground">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          <AdminReadingModeControl variant="desktop" />
          <button
            type="button"
            onClick={() => go(null, "Filters")}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/60 px-3.5 py-2 text-sm text-foreground transition-colors hover:bg-muted"
          >
            <Filter className="h-4 w-4" />
            Filters
          </button>
          <button
            type="button"
            onClick={() => go("/admin/exports", "Exports")}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-blue-500"
          >
            <Download className="h-4 w-4" />
            Export Report
          </button>
        </div>
      </div>
    </div>
  );
}