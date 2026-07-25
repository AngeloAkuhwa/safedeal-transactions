import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NoResultsState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
      <SearchX className="mb-3 h-8 w-8 text-muted-foreground" />
      <h3 className="text-base font-semibold text-foreground">No users match those filters</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Try broadening your search or clearing filters to see the full internal directory.
      </p>
      <Button className="mt-4" variant="outline" size="sm" onClick={onClear}>
        Clear all filters
      </Button>
    </div>
  );
}