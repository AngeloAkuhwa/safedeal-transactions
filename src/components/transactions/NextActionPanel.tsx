import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NextActionPanelProps {
  label: string;
  description: string;
  /** Buttons and secondary actions. */
  children?: React.ReactNode;
  className?: string;
}

/**
 * "Here is what to do next", in one treatment.
 *
 * The buyer's transaction detail and transaction tracking screens each drew
 * their own version of this, and both used
 * `bg-gradient-to-br from-warning to-warning/90` with `bg-white/10`,
 * `border-white/20` and `text-white` layered over it. Nineteen raw colours in
 * one, nine in the other, and white is the single value that cannot follow a
 * theme because it is white in both.
 *
 * It is also the "amber next action gradient" in the standing design debt, and
 * it was the largest remaining block of raw colour on any customer screen.
 *
 * Now it is a warning-toned card in the same shape as every other state
 * surface in the app: colour on the wash, the hairline and the glyph, words at
 * full contrast. A caution is a caution, not a billboard.
 *
 * Two copies of one panel is how the two screens would have drifted apart, the
 * way the visibility labels and the checkout auth state already did.
 */
export function NextActionPanel({ label, description, children, className }: NextActionPanelProps) {
  return (
    <div className={cn("rounded-2xl border border-warning/35 bg-warning/10 p-5 shadow-sm", className)}>
      <div className="mb-3 flex items-center gap-3">
        <AlertTriangle className="shrink-0 h-5 w-5 text-warning" />
        <h2 className="text-base font-bold text-foreground">{label}</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{description}</p>
      {children}
    </div>
  );
}
