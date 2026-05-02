import { PlusCircle, Store, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface SellerDashboardHeroProps {
  sellerName: string;
  verificationLabel?: string;
}

export function SellerDashboardHero({ sellerName, verificationLabel }: SellerDashboardHeroProps) {
  const navigate = useNavigate();
  const firstName = sellerName.split(" ")[0] || "Seller";

  return (
    <section className="relative">
      <div className="relative sd-page py-3 sm:py-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Store className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Seller Dashboard</span>
              {verificationLabel && (
                <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[10px] font-semibold bg-success/10 text-success">
                  <ShieldCheck className="h-2.5 w-2.5" />
                  {verificationLabel}
                </span>
              )}
            </div>
            <h1 className="sd-page-title">Welcome back, {firstName}</h1>
            <p className="sd-page-sub">Manage your protected transactions and monitor payments</p>
          </div>
          <Button
            size="sm"
            className="bg-success hover:bg-success/90 text-success-foreground h-8 text-xs shrink-0"
            onClick={() => navigate("/seller/transactions/new")}
          >
            <PlusCircle className="h-3.5 w-3.5 mr-1.5" />
            Create Protected Transaction
          </Button>
        </div>
      </div>
    </section>
  );
}
