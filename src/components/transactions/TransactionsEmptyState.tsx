import { ShoppingBag, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router";

interface TransactionsEmptyStateProps {
  variant: "no-data" | "no-filter-match";
  onClearFilters?: () => void;
}

export function TransactionsEmptyState({ variant, onClearFilters }: TransactionsEmptyStateProps) {
  if (variant === "no-filter-match") {
    return (
      <div className="sd-card p-8 text-center">
        <Search className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
        <h3 className="text-base font-semibold text-foreground mb-1">
          No purchases match your current filters
        </h3>
        <p className="text-xs text-muted-foreground max-w-md mx-auto mb-4">
          Try adjusting your search or filter criteria to find what you're looking for.
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
      <ShoppingBag className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
      <h3 className="text-base font-semibold text-foreground mb-1">
        You do not have any purchases yet
      </h3>
      <p className="text-xs text-muted-foreground max-w-md mx-auto mb-4">
        When you make your first purchase through SafeDeal, its transaction and delivery status will appear here.
      </p>
      <div className="flex items-center justify-center gap-2">
        <Button asChild size="sm" className="h-11 text-xs">
          <Link to="/dashboard">Back to Dashboard</Link>
        </Button>
        <Button variant="outline" size="sm" className="h-11 text-xs" asChild>
          <Link to="/#how-it-works">Learn how SafeDeal works</Link>
        </Button>
      </div>
    </div>
  );
}
