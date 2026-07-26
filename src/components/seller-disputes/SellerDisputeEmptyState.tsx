import { Link } from "react-router";
import { Shield, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  variant?: "no-data" | "no-filter-match";
  onClearFilters?: () => void;
}

export function SellerDisputeEmptyState({ variant = "no-data", onClearFilters }: Props) {
  if (variant === "no-filter-match") {
    return (
      <div className="rounded-2xl border bg-card p-12 text-center">
        <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
          <Search className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="font-semibold text-foreground mb-1">No disputes match your filters</h3>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-4">
          Try adjusting your search or filter criteria.
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
    <div className="rounded-2xl border bg-card p-16 text-center">
      <div className="h-16 w-16 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-5">
        <Shield className="h-7 w-7 text-success" />
      </div>
      <h3 className="text-xl font-bold text-foreground mb-2">You have no disputes right now.</h3>
      <p className="text-sm text-muted-foreground max-w-lg mx-auto mb-2">
        Transactions with buyer issues will appear here if a case is opened.
      </p>
      <p className="text-xs text-muted-foreground max-w-lg mx-auto mb-6">
        SafeDeal keeps a structured history of agreement terms, evidence, and transaction events so disputes can be reviewed fairly if they happen.
      </p>
      <Button asChild>
        <Link to="/seller/transactions">View Transactions</Link>
      </Button>
    </div>
  );
}
