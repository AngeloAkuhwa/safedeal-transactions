export function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/60 bg-card/60 p-4 lg:p-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-border/60 bg-background/60" />
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-border/60 bg-card/60 p-4 lg:p-6">
        <div className="mb-6 h-10 w-80 animate-pulse rounded-xl bg-muted/60" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted/40" />
          ))}
        </div>
      </div>
    </div>
  );
}