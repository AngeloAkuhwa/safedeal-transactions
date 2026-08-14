import { Link } from "react-router";
import { Store, PackagePlus, ArrowRight, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SellerSummary, SellerMetrics } from "@/services/seller-dashboard.service";

interface Props {
  seller: SellerSummary;
  metrics: SellerMetrics;
}

export function SellerDashboardEmptyState({ seller, metrics }: Props) {
  const hasProducts = seller.has_published_products;
  const noTransactions = metrics.transactions_created_count === 0;

  if (hasProducts && noTransactions) {
    return (
      <div className="rounded-2xl border bg-card p-10 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Share2 className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-lg font-bold text-foreground">Share your store or create a private offer</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Your products are ready. Share your storefront or create a direct deal link for a buyer.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild variant="outline">
            <Link to="/seller/storefront">
              <Store className="h-4 w-4" />
              View storefront
            </Link>
          </Button>
          <Button asChild>
            <Link to="/seller/transactions/new">
              Create a transaction
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-card p-10 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
        <PackagePlus className="h-7 w-7 text-primary" />
      </div>
      <h2 className="text-lg font-bold text-foreground">Start your first transaction</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Create a product listing or send a transaction link to a buyer. SafeDeal holds the payment in escrow until the buyer confirms the item.
      </p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button asChild variant="outline">
          <Link to="/seller/storefront/new">
            <PackagePlus className="h-4 w-4" />
            Create product
          </Link>
        </Button>
        <Button asChild>
          <Link to="/seller/transactions/new">
            Create direct deal
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}