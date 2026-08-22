import { AlertTriangle } from "lucide-react";

interface MissingTermsWarningProps {
  show: boolean;
}

export function MissingTermsWarning({ show }: MissingTermsWarningProps) {
  if (!show) return null;
  return (
    <div className="border border-warning/30 bg-warning/10 rounded-xl p-4 flex items-start gap-3">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">Delivery terms not found</p>
        <p className="text-xs text-muted-foreground">
          We couldn't find a saved delivery agreement for this transaction. Default settings will be used (courier
          method, 72-hour buyer verification window). Please contact support if this looks wrong.
        </p>
      </div>
    </div>
  );
}
