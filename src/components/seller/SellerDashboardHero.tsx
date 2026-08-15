import { PlusCircle, Store, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { resolveClaim } from "@/lib/trust/trust-claims";

interface SellerDashboardHeroProps {
  sellerName: string;
  /** Verification chrome renders only for a genuinely identity-verified seller. */
  identityVerified?: boolean;
}

export function SellerDashboardHero({ sellerName, identityVerified }: SellerDashboardHeroProps) {
  const verificationClaim = resolveClaim("SELLER_VERIFIED", { identityVerified });
  const navigate = useNavigate();
  const firstName = sellerName.split(" ")[0] || "Seller";

  return (
    <section className="relative">
      <div className="relative sd-page py-3 sm:py-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Store className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Seller Dashboard</span>
              {verificationClaim && (
                <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-full text-xs font-semibold bg-success/10 text-success">
                  <ShieldCheck className="h-2.5 w-2.5" />
                  {verificationClaim}
                </span>
              )}
            </div>
            <h1 className="sd-page-title">Welcome back, {firstName}</h1>
            <p className="sd-page-sub">Manage your protected transactions and monitor payments</p>
          </div>
          <Button
            size="sm"
            className="bg-success hover:bg-success/90 text-success-foreground h-11 text-xs shrink-0"
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
