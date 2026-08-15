import { Link } from "react-router";
import { Scale, MapPin, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { BuyerDashboardMetrics } from "@/services/dashboard.service";

interface QuickAccessProps {
  metrics: BuyerDashboardMetrics;
}

export function QuickAccess({ metrics }: QuickAccessProps) {
  return (
    <div className="grid md:grid-cols-2 gap-3">
      {/* Disputes */}
      <Card className="sd-card">
        <CardContent className="p-3">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                <Scale className="h-4 w-4 text-destructive" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Disputes</h3>
                <p className="text-xs text-muted-foreground">Manage your open disputes</p>
              </div>
            </div>
            <span className="inline-flex items-center justify-center h-6 min-w-6 px-1.5 rounded-full bg-destructive/10 text-destructive font-bold text-xs">
              {metrics.open_disputes}
            </span>
          </div>
          <Button
            asChild
            className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 min-h-11 text-xs gap-1.5"
            size="sm"
          >
            <Link to="/dashboard/disputes">
              <ArrowRight className="h-3.5 w-3.5" />
              View All Disputes
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Track Purchases */}
      <Card className="sd-card">
        <CardContent className="p-3">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <MapPin className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Track Purchases</h3>
                <p className="text-xs text-muted-foreground">Monitor your order status</p>
              </div>
            </div>
            <span className="inline-flex items-center justify-center h-6 min-w-6 px-1.5 rounded-full bg-primary/10 text-primary font-bold text-xs">
              {metrics.awaiting_delivery}
            </span>
          </div>
          <Button
            asChild
            className="w-full min-h-11 text-xs gap-1.5"
            size="sm"
          >
            <Link to="/dashboard/transactions">
              <ArrowRight className="h-3.5 w-3.5" />
              Track All Orders
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
