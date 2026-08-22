import { CheckCircle, Lock, Eye, FileText } from "lucide-react";
import { Link } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const items = [
  { icon: CheckCircle, title: "Identity Information", description: "Completed checks are recorded on the account and used where a workflow requires them." },
  { icon: Lock, title: "Secure Transactions", description: "Disputes and payouts may require completed verification to ensure security." },
  { icon: Eye, title: "Recorded Evidence", description: "SafeDeal uses locked agreements and evidence history during dispute handling." },
  { icon: FileText, title: "Transparent Timeline", description: "Every action is timestamped and recorded for complete transparency." },
];

export function TrustSafetyPanel() {
  return (
    <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
      <CardHeader>
        <CardTitle className="text-lg">
          Trust & Safety
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((item) => (
          <div key={item.title} className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <item.icon className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{item.title}</p>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
          </div>
        ))}
        <Button asChild variant="outline" className="w-full mt-2 text-primary border-primary/30">
          <Link to="/legal/terms">Read the terms</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
