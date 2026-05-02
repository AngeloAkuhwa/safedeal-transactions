import { Badge } from "@/components/ui/badge";
import { resolveProductStatusLabel, TONE_CLASSNAMES } from "@/lib/status-labels";

export function ProductStatusBadge({ status }: { status: string }) {
  const entry = resolveProductStatusLabel(status);
  return (
    <Badge variant="outline" className={TONE_CLASSNAMES[entry.tone]}>
      {entry.label}
    </Badge>
  );
}
