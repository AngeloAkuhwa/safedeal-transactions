import { Shield, CheckCircle, Lock, Eye, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const items = [
  { icon: CheckCircle, text: "Verified buyer information" },
  { icon: Lock, text: "Secure escrow transactions" },
  { icon: Eye, text: "Protected dispute evidence" },
  { icon: FileText, text: "Transparent activity timeline" },
];

export function TrustSafetyPanel() {
  return (
    <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Shield className="h-5 w-5 text-primary" />
          Trust & Safety
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((item) => (
          <div key={item.text} className="flex items-start gap-3">
            <item.icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <p className="text-sm text-muted-foreground">{item.text}</p>
          </div>
        ))}
        <Button variant="outline" className="w-full mt-2 text-primary border-primary/30" disabled>
          Learn More
        </Button>
      </CardContent>
    </Card>
  );
}
