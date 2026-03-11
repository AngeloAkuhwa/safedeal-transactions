import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SellerDashboardHeroProps {
  sellerName: string;
}

export function SellerDashboardHero({ sellerName }: SellerDashboardHeroProps) {
  const firstName = sellerName.split(" ")[0] || "Seller";

  return (
    <section className="bg-gradient-to-br from-success/10 via-success/5 to-background border-b">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
              Welcome back, {firstName}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage your protected transactions and monitor payments
            </p>
          </div>
          <Button size="lg" className="bg-success hover:bg-success/90 text-success-foreground">
            <Plus className="h-4 w-4" />
            Create Protected Transaction
          </Button>
        </div>
      </div>
    </section>
  );
}
