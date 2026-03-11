import { PlusCircle, Store } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface SellerDashboardHeroProps {
  sellerName: string;
}

export function SellerDashboardHero({ sellerName }: SellerDashboardHeroProps) {
  const navigate = useNavigate();
  const firstName = sellerName.split(" ")[0] || "Seller";

  return (
    <section className="relative overflow-hidden">
      {/* Decorative blur orbs */}
      <div className="absolute top-0 left-1/4 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-success/5 rounded-full blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Store className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-muted-foreground">Seller Dashboard</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">
              Welcome back, {firstName}
            </h1>
            <p className="text-base text-muted-foreground mt-1">
              Manage your protected transactions and monitor payments
            </p>
          </div>
          <Button size="lg" className="bg-success hover:bg-success/90 text-success-foreground px-6 py-3 rounded-xl shadow-lg" onClick={() => navigate("/seller/transactions/new")}>
            <PlusCircle className="h-5 w-5" />
            Create Protected Transaction
          </Button>
        </div>
      </div>
    </section>
  );
}
