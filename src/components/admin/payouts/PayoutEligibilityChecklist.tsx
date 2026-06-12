import { CheckCircle2, XCircle } from "lucide-react";
import type { PayoutEligibilityGate } from "@/services/admin-payouts.service";

export function PayoutEligibilityChecklist({ gates }: { gates: PayoutEligibilityGate[] }) {
  return (
    <ul className="space-y-2">
      {gates.map((g) => (
        <li key={g.key} className="flex items-start gap-2 text-sm">
          {g.pass
            ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
            : <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />}
          <span className={g.pass ? "text-foreground/80" : "text-foreground font-medium"}>{g.label}</span>
        </li>
      ))}
    </ul>
  );
}