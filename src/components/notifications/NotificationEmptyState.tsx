import { BellOff, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router";

interface NotificationEmptyStateProps {
  variant: "no-data" | "no-filter-match";
  onClearFilters?: () => void;
}

export function NotificationEmptyState({ variant, onClearFilters }: NotificationEmptyStateProps) {
  if (variant === "no-filter-match") {
    return (
      <div className="sd-card p-8 text-center">
        <Search className="mx-auto h-5 w-5 text-muted-foreground" />
        <h2 className="text-base font-semibold text-foreground mb-1">No matching notifications</h2>
        <p className="text-xs text-muted-foreground max-w-md mx-auto mb-3">
          Try adjusting your filters or search to find what you're looking for.
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
      <BellOff className="mx-auto h-5 w-5 text-success" />
      <h2 className="text-base font-semibold text-foreground mb-1">You're all caught up!</h2>
      <p className="text-xs text-muted-foreground max-w-md mx-auto mb-3">
        Transaction updates, delivery alerts, and verification reminders will appear here.
      </p>
      <Button asChild variant="outline" size="sm" className="h-11 text-xs">
        <Link to="/dashboard/transactions">Go to My Purchases</Link>
      </Button>
    </div>
  );
}
