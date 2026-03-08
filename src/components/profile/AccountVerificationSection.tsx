import { useNavigate } from "react-router-dom";
import { ShieldCheck, Mail, Phone, CreditCard, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { VerificationStatus } from "@/services/profile.service";

interface Props {
  verification: VerificationStatus;
  isLoading?: boolean;
}

const getItems = (v: VerificationStatus) => [
  {
    key: "email_verified" as const,
    label: "Email Verified",
    icon: Mail,
    description: v.email_verified ? "Verified" : "Email verification required",
    verified: v.email_verified,
    clickable: false,
  },
  {
    key: "phone_verified" as const,
    label: "Phone Verified",
    icon: Phone,
    description: v.phone_verified ? "Verified" : "Phone verification required",
    verified: v.phone_verified,
    clickable: false,
  },
  {
    key: "identity_verified" as const,
    label: "Identity Verification",
    icon: CreditCard,
    description: v.identity_verified
      ? "Identity verified"
      : "Required for high-value transactions",
    verified: v.identity_verified,
    clickable: !v.identity_verified,
  },
];

export function AccountVerificationSection({ verification, isLoading }: Props) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Account Verification
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  const items = getItems(verification);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Account Verification
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <div
            key={item.key}
            className={`flex items-center justify-between rounded-lg border p-3 ${
              item.clickable
                ? "cursor-pointer hover:bg-accent/50 transition-colors"
                : ""
            }`}
            onClick={item.clickable ? () => navigate("/dashboard/verification") : undefined}
            role={item.clickable ? "button" : undefined}
            tabIndex={item.clickable ? 0 : undefined}
            onKeyDown={
              item.clickable
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate("/dashboard/verification");
                    }
                  }
                : undefined
            }
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                <item.icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
            </div>
            {item.verified ? (
              <Badge className="bg-success/10 text-success border-success/20 hover:bg-success/10">
                <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                Verified
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground border-border">
                Not Verified
              </Badge>
            )}
          </div>
        ))}

        {verification.identity_verified ? (
          <div className="pt-2 flex items-center justify-center gap-2 text-success text-sm font-medium">
            <CheckCircle2 className="h-4 w-4" />
            Identity verification complete
          </div>
        ) : (
          <div className="pt-2 text-center">
            <Button
              variant="outline"
              className="text-primary border-primary/30"
              onClick={() => navigate("/dashboard/verification")}
            >
              Complete Verification
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
