import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Layout-preserving loading states.
 *
 * shadcn's guidance is "Skeleton matching content layout", never "Spinner for
 * card loading", and the WCAG-adjacent rule is that a loading state must
 * "preserve layout focus and accessible busy status". A centred spinner does
 * neither: it collapses the page to a single icon, so content jumps into place
 * when data lands, and it carries no information about what is arriving.
 *
 * It is also actively worse for some users here. `index.css` disables
 * `animate-spin` under `prefers-reduced-motion`, so on those devices a
 * spinner-only branch renders a completely static icon with no progress signal.
 * A skeleton still communicates shape and position when its shimmer is off.
 *
 * Every export below announces itself with `role="status"` and `aria-busy`, and
 * carries a screen-reader label, so assistive tech is told the region is
 * loading rather than being handed a silent box of grey rectangles.
 */

interface Props {
  /** Screen-reader label. Say what is loading, not "Loading…". */
  label: string;
  className?: string;
}

function Region({ label, className, children }: Props & { children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/**
 * Full-page shell: sticky header bar, page title, then content blocks. Mirrors
 * the shape every authenticated detail and settings page renders once loaded.
 */
export function PageSkeleton({ label, className, blocks = 3 }: Props & { blocks?: number }) {
  return (
    <Region label={label} className={cn("min-h-[100dvh] bg-background", className)}>
      <Skeleton className="h-14 w-full rounded-none" />
      <div className="sd-page space-y-4 py-6">
        <Skeleton className="h-7 w-1/2 max-w-[280px] rounded-md" />
        <Skeleton className="h-4 w-2/3 max-w-[360px] rounded" />
        {Array.from({ length: blocks }).map((_, i) => (
          <Skeleton key={i} className={cn("w-full rounded-xl", i === 0 ? "h-40" : "h-28")} />
        ))}
      </div>
    </Region>
  );
}

/**
 * Full-page shell for money screens: summary panel first, then line items.
 * Used where the loaded page leads with an amount, so the eye lands in the same
 * place before and after.
 */
export function SummaryPageSkeleton({ label, className }: Props) {
  return (
    <Region label={label} className={cn("min-h-[100dvh] bg-background", className)}>
      <Skeleton className="h-14 w-full rounded-none" />
      <div className="sd-page space-y-4 py-6">
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    </Region>
  );
}

/** Rows inside an already-rendered page. Keeps the surrounding chrome intact. */
export function ListSkeleton({ label, className, rows = 4, height = "h-20" }: Props & { rows?: number; height?: string }) {
  return (
    <Region label={label} className={cn("space-y-3", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={cn("w-full rounded-xl", height)} />
      ))}
    </Region>
  );
}

/** A short inline block: a panel or drawer body that is still filling in. */
export function BlockSkeleton({ label, className, lines = 3 }: Props & { lines?: number }) {
  return (
    <Region label={label} className={cn("space-y-2.5", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn("h-4 rounded", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </Region>
  );
}
