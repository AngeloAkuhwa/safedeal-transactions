import { Badge } from "@/components/ui/badge";

const visibilityConfig: Record<string, { label: string; className: string }> = {
  public: { label: "Public", className: "bg-primary/10 text-primary border-primary/20" },
  buyer_specific: { label: "Buyer Specific", className: "bg-warning/10 text-warning border-warning/20" },
  private_draft: { label: "Private", className: "bg-muted text-muted-foreground border-border" },
};

export function ProductVisibilityBadge({ visibility }: { visibility: string }) {
  const config = visibilityConfig[visibility] || visibilityConfig.public;
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}
