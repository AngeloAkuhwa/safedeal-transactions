import { Skeleton } from "@/components/ui/skeleton";

export function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[128px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[92px] rounded-xl" />
      <Skeleton className="h-[420px] rounded-xl" />
    </div>
  );
}