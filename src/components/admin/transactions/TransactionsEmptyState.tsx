import { Inbox, SearchX, Filter, Scale, Flag } from "lucide-react";
import { ADMIN_FOCUS_VISIBLE } from "@/components/admin/palette";

export type EmptyVariant = "no-data" | "no-search" | "no-filtered" | "no-disputes" | "no-flagged";

const META: Record<EmptyVariant, { Icon: typeof Inbox; title: string; hint: string; cta?: string }> = {
  "no-data": {
    Icon: Inbox,
    title: "No transactions yet",
    hint: "When buyers and sellers transact on SafeDeal, they'll appear here in real time.",
  },
  "no-search": {
    Icon: SearchX,
    title: "No matches for your search",
    hint: "Try a different transaction code, party name, item title, email, or phone.",
    cta: "Clear filters",
  },
  "no-filtered": {
    Icon: Filter,
    title: "No transactions match these filters",
    hint: "Loosen your filters to see more results.",
    cta: "Clear filters",
  },
  "no-disputes": {
    Icon: Scale,
    title: "No disputes right now",
    hint: "Disputed transactions will appear here as soon as a buyer opens a case.",
  },
  "no-flagged": {
    Icon: Flag,
    title: "Nothing flagged",
    hint: "Risk-flagged or admin-flagged transactions will surface here for review.",
  },
};

export function TransactionsEmptyState({
  variant,
  onClearFilters,
  className,
}: {
  variant: EmptyVariant;
  onClearFilters?: () => void;
  className?: string;
}) {
  const { Icon, title, hint, cta } = META[variant];
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-2 px-6 py-12 text-center ${className ?? ""}`}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <p className="max-w-sm text-xs text-muted-foreground">{hint}</p>
      {cta && onClearFilters ? (
        <button
          type="button"
          onClick={onClearFilters}
          className={`mt-2 rounded-md border border-border bg-muted/60 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted ${ADMIN_FOCUS_VISIBLE} min-h-11`}
        >
          {cta}
        </button>
      ) : null}
    </div>
  );
}