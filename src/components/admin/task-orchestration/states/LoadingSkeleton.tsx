export function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl border border-border/50 bg-card/60" />
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-2xl border border-border/50 bg-card/60 p-6">
          <div className="h-4 w-40 rounded bg-muted" />
          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, j) => <div key={j} className="h-20 rounded bg-muted/60" />)}
          </div>
        </div>
      ))}
    </div>
  );
}