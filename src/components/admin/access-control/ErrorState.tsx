import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load internal user data. Please try again.",
  onRetry,
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-500/30 bg-red-500/5 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 text-red-300">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <div>
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="mt-1 text-xs text-muted-foreground">{description}</div>
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button>
      )}
    </div>
  );
}