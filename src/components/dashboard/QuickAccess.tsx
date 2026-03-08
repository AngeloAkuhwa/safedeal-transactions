import { Link } from "react-router-dom";
import { Scale, MapPin, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { BuyerDashboardMetrics } from "@/services/dashboard.service";

interface QuickAccessProps {
  metrics: BuyerDashboardMetrics;
}

export function QuickAccess({ metrics }: QuickAccessProps) {
  return (
    <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
      {/* Disputes */}
      <Card className="shadow-md hover:shadow-lg transition-shadow">
        <CardContent className="p-6 lg:p-8">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-destructive/10 flex items-center justify-center">
                <Scale className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Disputes</h3>
                <p className="text-sm text-muted-foreground">Manage your open disputes</p>
              </div>
            </div>
            <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-destructive/10 text-destructive font-bold text-sm">
              {metrics.open_disputes}
            </span>
          </div>
          <Button
            asChild
            className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 font-bold"
            size="lg"
          >
            <Link to="/dashboard/disputes">
              <ArrowRight className="h-4 w-4" />
              View All Disputes
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Track Purchases */}
      <Card className="shadow-md hover:shadow-lg transition-shadow">
        <CardContent className="p-6 lg:p-8">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <MapPin className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Track Purchases</h3>
                <p className="text-sm text-muted-foreground">Monitor your order status</p>
              </div>
            </div>
            <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
              {metrics.awaiting_delivery}
            </span>
          </div>
          <Button
            asChild
            className="w-full font-bold"
            size="lg"
          >
            <Link to="/dashboard/transactions">
              <ArrowRight className="h-4 w-4" />
              Track All Orders
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
