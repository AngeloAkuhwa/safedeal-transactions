import { Link } from "react-router";
import { Search, HelpCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DashboardHeroProps {
  buyerName: string;
}

export function DashboardHero({ buyerName }: DashboardHeroProps) {
  const firstName = buyerName.split(" ")[0] || "User";

  return (
    <section className="border-b bg-background">
      <div className="sd-page sd-page-y">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              <span className="sd-eyebrow">Buyer Dashboard</span>
            </div>
            <h1 className="sd-page-title">Welcome back, {firstName}</h1>
            <p className="sd-page-sub">Your purchases at a glance</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button asChild size="sm" className="h-11 text-xs gap-1.5">
              <Link to="/dashboard/transactions">
                <Search className="h-3.5 w-3.5" />
                Track Purchase
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="h-11 text-xs gap-1.5">
              <Link to="/#faq">
                <HelpCircle className="h-3.5 w-3.5" />
                Need Help?
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
