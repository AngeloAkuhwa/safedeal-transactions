import { Scale, Search } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";

interface BuyerDisputeEmptyStateProps {
  variant: "no-data" | "no-filter-match";
  onClearFilters?: () => void;
}

export function BuyerDisputeEmptyState({ variant, onClearFilters }: BuyerDisputeEmptyStateProps) {
  const navigate = useNavigate();

  if (variant === "no-filter-match") {
    return (
      <div className="sd-card p-8 text-center">
        <Search className="mx-auto h-5 w-5 text-muted-foreground" />
        <h2 className="text-base font-semibold text-foreground mb-1">
          No disputes match your filters
        </h2>
        <p className="text-xs text-muted-foreground max-w-md mx-auto mb-3">
          Try adjusting your search terms or clearing the filters.
        </p>
        {onClearFilters && (
          <Button variant="outline" size="sm" className="h-11 text-xs" onClick={onClearFilters}>
            Clear Filters
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="sd-card p-8 text-center">
      <Scale className="mx-auto h-5 w-5 text-success" />
      <h2 className="text-base font-semibold text-foreground mb-1">
        No Disputes Yet
      </h2>
      <p className="text-xs text-muted-foreground max-w-md mx-auto mb-4">
        If there is ever a problem with a delivered transaction, your dispute cases will appear here.
      </p>
      <div className="flex items-center justify-center gap-2">
        <Button variant="outline" size="sm" className="h-11 text-xs" onClick={() => navigate("/dashboard")}>
          Back to Dashboard
        </Button>
        <Button size="sm" className="h-11 text-xs" onClick={() => navigate("/dashboard/transactions")}>
          Go to My Purchases
        </Button>
      </div>
    </div>
  );
}
