import { BellOff, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

interface NotificationEmptyStateProps {
  variant: "no-data" | "no-filter-match";
  onClearFilters?: () => void;
}

export function NotificationEmptyState({ variant, onClearFilters }: NotificationEmptyStateProps) {
  if (variant === "no-filter-match") {
    return (
      <div className="rounded-2xl border bg-card p-12 text-center">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
          <Search className="h-7 w-7 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">No matching notifications</h2>
        <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
          Try adjusting your filters or search to find what you're looking for.
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
        <BellOff className="h-7 w-7 text-success" />
      </div>
      <h2 className="text-xl font-bold text-foreground mb-2">You're all caught up!</h2>
      <p className="text-muted-foreground text-sm max-w-md mx-auto mb-4">
        Transaction updates, delivery alerts, and verification reminders will appear here.
      </p>
      <Button asChild variant="outline">
        <Link to="/dashboard/transactions">Go to My Purchases</Link>
      </Button>
    </div>
  );
}
