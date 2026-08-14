import { Info, Lock, Scale, Shield } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function SellerDisputeTrustBanner() {
  return (
    <Card className="rounded-2xl border-primary/10 bg-primary/[0.02]">
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Info className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-foreground">How SafeDeal Handles Disputes</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          The original transaction agreement is locked after payment. Both buyer and seller evidence are
          considered during review. Active disputes may keep funds frozen or block payout release until resolved.
          Always respond before the deadline when applicable.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: Lock, label: "Locked Agreement Review", desc: "Terms frozen at payment time" },
            { icon: Scale, label: "Evidence-Based Decisions", desc: "Both sides considered fairly" },
            { icon: Shield, label: "Payout Status", desc: "Release remains blocked during review" },
          ].map((item) => (
            <div key={item.label} className="flex flex-col items-center text-center gap-2">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <item.icon className="h-5 w-5 text-primary" />
              </div>
              <span className="text-sm font-medium text-foreground">{item.label}</span>
              <span className="text-xs text-muted-foreground">{item.desc}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
