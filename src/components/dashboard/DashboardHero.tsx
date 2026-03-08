import { Link } from "react-router-dom";
import { Search, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DashboardHeroProps {
  buyerName: string;
}

export function DashboardHero({ buyerName }: DashboardHeroProps) {
  const firstName = buyerName.split(" ")[0] || "User";

  return (
    <section className="bg-primary py-10 sm:py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-primary-foreground mb-2">
              Welcome back, {firstName}!
            </h1>
            <p className="text-primary-foreground/80 text-base sm:text-lg">
              Your protected purchases at a glance
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              asChild
              variant="secondary"
              size="lg"
              className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 font-bold"
            >
              <Link to="/dashboard/transactions">
                <Search className="h-4 w-4" />
                Track Purchase
              </Link>
            </Button>
            <Button
              size="lg"
              className="bg-primary-foreground/20 text-primary-foreground border border-primary-foreground/30 hover:bg-primary-foreground/30 font-bold"
            >
              <HelpCircle className="h-4 w-4" />
              Need Help?
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
