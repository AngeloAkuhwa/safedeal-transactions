import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Loader2, ShieldCheck, Upload, Phone, UserCheck, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BuyerNav } from "@/components/dashboard/BuyerNav";
import { Footer } from "@/components/landing/Footer";
import { getBuyerProfile } from "@/services/profile.service";

const steps = [
  {
    icon: Upload,
    title: "Upload Government-Issued ID",
    description: "Provide a valid passport, driver's license, or national ID card.",
  },
  {
    icon: Phone,
    title: "Confirm Phone Number",
    description: "Verify your phone number via SMS code.",
  },
  {
    icon: UserCheck,
    title: "Complete Identity Check",
    description: "Our team reviews your submission within 24–48 hours.",
  },
];

const BuyerVerification = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["buyer-profile"],
    queryFn: getBuyerProfile,
    retry: 1,
    staleTime: 30_000,
  });

  if (isLoading || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <BuyerNav buyerName={data.profile.full_name} avatarUrl={data.profile.avatar_url} />

      {/* Hero */}
      <section className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent py-8 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
            <Link to="/dashboard" className="hover:text-foreground transition-colors">
              Dashboard
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link to="/dashboard/profile" className="hover:text-foreground transition-colors">
              Profile
            </Link>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-foreground font-medium">Verification</span>
          </nav>

          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                Account Verification
              </h1>
              <p className="text-muted-foreground text-sm">
                Increase trust and unlock higher transaction limits
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Content */}
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Verification Requirements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm text-muted-foreground">
              To increase trust on SafeDeal and unlock higher transaction limits, we require
              identity verification. Complete the steps below to get verified.
            </p>

            <div className="space-y-4">
              {steps.map((step, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-4 rounded-lg border p-4"
                >
                  <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                    <step.icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{step.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-lg bg-muted/50 border border-dashed p-6 text-center">
              <Badge variant="secondary" className="mb-2">Coming Soon</Badge>
              <p className="text-sm text-muted-foreground">
                The verification flow is currently being built. Check back soon.
              </p>
            </div>
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
};

export default BuyerVerification;
