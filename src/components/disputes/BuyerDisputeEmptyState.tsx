import { Scale, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface BuyerDisputeEmptyStateProps {
  variant: "no-data" | "no-filter-match";
  onClearFilters?: () => void;
}

export function BuyerDisputeEmptyState({ variant, onClearFilters }: BuyerDisputeEmptyStateProps) {
  const navigate = useNavigate();

  if (variant === "no-filter-match") {
    return (
      <div className="rounded-2xl border bg-card p-12 text-center">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
          <Search className="h-7 w-7 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">
          No disputes match your filters
        </h2>
        <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
          Try adjusting your search terms or clearing the filters.
        </p>
        {onClearFilters && (
          <Button variant="outline" onClick={onClearFilters}>
            Clear Filters
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-card p-12 text-center">
      <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
        <Scale className="h-7 w-7 text-success" />
      </div>
      <h2 className="text-xl font-bold text-foreground mb-2">
        No Disputes Yet
      </h2>
      <p className="text-muted-foreground text-sm max-w-md mx-auto mb-6">
        If there is ever a problem with a delivered transaction, your dispute cases will appear here.
      </p>
      <div className="flex items-center justify-center gap-3">
        <Button variant="outline" onClick={() => navigate("/dashboard")}>
          Back to Dashboard
        </Button>
        <Button onClick={() => navigate("/dashboard/transactions")}>
          Go to My Purchases
        </Button>
      </div>
    </div>
  );
}
