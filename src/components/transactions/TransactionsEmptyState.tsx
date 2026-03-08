import { ShoppingBag, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

interface TransactionsEmptyStateProps {
  variant: "no-data" | "no-filter-match";
  onClearFilters?: () => void;
}

export function TransactionsEmptyState({ variant, onClearFilters }: TransactionsEmptyStateProps) {
  if (variant === "no-filter-match") {
    return (
      <div className="rounded-2xl border bg-card p-12 text-center">
        <Search className="h-14 w-14 text-muted-foreground/30 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-foreground mb-2">
          No purchases match your current filters
        </h3>
        <p className="text-muted-foreground text-sm max-w-md mx-auto mb-6">
          Try adjusting your search or filter criteria to find what you're looking for.
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
      <ShoppingBag className="h-14 w-14 text-muted-foreground/30 mx-auto mb-4" />
      <h3 className="text-lg font-bold text-foreground mb-2">
        You do not have any protected purchases yet
      </h3>
      <p className="text-muted-foreground text-sm max-w-md mx-auto mb-6">
        When you make your first secure purchase through SafeDeal, it will appear here with full tracking and protection.
      </p>
      <div className="flex items-center justify-center gap-3">
        <Button asChild>
          <Link to="/dashboard">Back to Dashboard</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/#how-it-works">Learn how SafeDeal works</Link>
        </Button>
      </div>
    </div>
  );
}
