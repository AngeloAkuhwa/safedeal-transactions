import { Badge } from "@/components/ui/badge";

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground border-border" },
  published: { label: "Published", className: "bg-success/10 text-success border-success/20" },
  out_of_stock: { label: "Out of Stock", className: "bg-warning/10 text-warning border-warning/20" },
  archived: { label: "Archived", className: "bg-destructive/10 text-destructive border-destructive/20" },
};

export function ProductStatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || statusConfig.draft;
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}
