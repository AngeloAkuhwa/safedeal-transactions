import { ShieldCheck, Mail, Phone, CreditCard, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { VerificationStatus } from "@/services/profile.service";

interface Props {
  verification: VerificationStatus;
}

const items = [
  { key: "email_verified" as const, label: "Email Verified", icon: Mail, description: "Verified on signup" },
  { key: "phone_verified" as const, label: "Phone Verified", icon: Phone, description: "Verified on signup" },
  { key: "identity_verified" as const, label: "Identity Verification", icon: CreditCard, description: "Required for high-value transactions" },
];

export function AccountVerificationSection({ verification }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Account Verification
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => {
          const verified = verification[item.key];
          return (
            <div
              key={item.key}
              className="flex items-center justify-between rounded-lg border p-4"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                  <item.icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
              </div>
              {verified ? (
                <Badge className="bg-success/10 text-success border-success/20 hover:bg-success/10">
                  <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                  Verified
                </Badge>
              ) : (
                <Badge variant="outline" className="text-warning border-warning/30">
                  <Clock className="h-3.5 w-3.5 mr-1" />
                  Pending
                </Badge>
              )}
            </div>
          );
        })}

        {!verification.identity_verified && (
          <div className="pt-2 text-center">
            <Button variant="outline" className="text-primary border-primary/30" disabled>
              Complete Verification
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
