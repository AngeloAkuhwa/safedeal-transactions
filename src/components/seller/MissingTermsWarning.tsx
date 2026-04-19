import { AlertTriangle } from "lucide-react";

interface MissingTermsWarningProps {
  show: boolean;
}

export function MissingTermsWarning({ show }: MissingTermsWarningProps) {
  if (!show) return null;
  return (
    <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3">
      <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
      <div className="space-y-1">
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Delivery terms not found</p>
        <p className="text-xs text-amber-800 dark:text-amber-300">
          We couldn't find a saved delivery agreement for this transaction. Default settings will be used (courier
          method, 72-hour buyer verification window). Please contact support if this looks wrong.
        </p>
      </div>
    </div>
  );
}
