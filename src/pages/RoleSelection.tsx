import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import {
  Shield, ShoppingBag, Store, Loader2, CheckCircle,
  ArrowLeftRight, Users, Lock, FileText, Camera, Vault, LogOut
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Footer } from "@/components/landing/Footer";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getSession, signOut } from "@/services/auth.service";
import { getUserRoles, assignRole, checkRoleExists } from "@/services/role.service";
import type { SelectableRole } from "@/services/role.service";
import { isInternalUser } from "@/lib/internal-role";

const buyerFeatures = [
  { icon: Shield, title: "Payment Protection", description: "Funds held until you verify receipt" },
  { icon: CheckCircle, title: "Verification Control", description: "Verify item before funds are released to seller" },
  { icon: FileText, title: "Dispute Window", description: "Raise disputes before verification window expires" },
];

const sellerFeatures = [
  { icon: Lock, title: "Secure Payment Guarantee", description: "Get paid after buyer confirmation or timeout" },
  { icon: Camera, title: "Delivery Proof Required", description: "Upload delivery proof to protect your payment" },
  { icon: CheckCircle, title: "Automatic Release", description: "Funds released after buyer confirms or window expires" },
];

const infoCards = [
  { icon: ArrowLeftRight, title: "Switch Anytime", description: "Change your role from dashboard settings whenever needed" },
  { icon: Users, title: "Dual Roles", description: "Use both buyer and seller features on the same account" },
  { icon: Shield, title: "Escrow on every deal", description: "Every SafeDeal transaction routes payment through escrow before release" },
];

const RoleSelection = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<SelectableRole | null>(null);


  const isSafeRelativePath = (path: string | null | undefined): path is string =>
    !!path && path.startsWith("/") && !path.startsWith("//");

  const getRedirectTarget = () => {
    const paramRedirect = searchParams.get("redirect");
    if (isSafeRelativePath(paramRedirect)) return paramRedirect;
    const storedRedirect = sessionStorage.getItem("safedeal_redirect");
    if (isSafeRelativePath(storedRedirect)) return storedRedirect;
    return null;
  };

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await getSession();
      if (!session) return; // ProtectedRoute handles redirect

      // Internal team members (support agents, admins, auditors, …) must
      // never see the Buyer/Seller picker. Route them straight to admin.
      if (await isInternalUser(session.user.id)) {
        navigate("/admin/dashboard", { replace: true });
        return;
      }

      const { data: roles } = await getUserRoles(session.user.id);
      if (roles && roles.length > 0) {
        const roleNames = roles.map((r) => r.role);
        const redirectTarget = getRedirectTarget();
        if (redirectTarget) {
          sessionStorage.removeItem("safedeal_redirect");
          navigate(redirectTarget, { replace: true });
        } else {
          // Route to correct dashboard based on roles
          const destination = roleNames.includes("seller") && !roleNames.includes("buyer")
            ? "/seller"
            : "/dashboard";
          navigate(destination, { replace: true });
        }
        return;
      }

      setLoading(false);
    };
    check();
  }, [navigate]);

  const handleSelectRole = async (role: SelectableRole) => {
    if (submitting) return;
    setSubmitting(role);
    try {
      const { data: { session } } = await getSession();
      if (!session) { navigate("/auth?mode=login", { replace: true }); return; }

      const { data: existing } = await checkRoleExists(session.user.id, role);
      if (existing && existing.length > 0) {
        toast.info("This role is already assigned to your account.");
        navigate(role === "seller" ? "/seller" : "/dashboard", { replace: true });
        return;
      }

      const result = await assignRole(session.user.id, role);
      if (!result.success) {
        toast.error("Could not assign role. Please try again.");
        return;
      }

      toast.success(`You're all set as a ${role === "buyer" ? "Buyer" : "Seller"}!`);
      const destination = role === "seller" ? "/seller" : "/dashboard";
      const redirectTarget = getRedirectTarget();
      if (redirectTarget) {
        sessionStorage.removeItem("safedeal_redirect");
        navigate(redirectTarget, { replace: true });
      } else {
        navigate(destination, { replace: true });
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(null);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <header className="sticky top-0 z-sticky w-full border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity min-h-11">
            <Shield className="h-7 w-7 text-primary" />
            <span className="text-xl font-bold text-foreground">SafeDeal</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Log out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="pt-10 pb-6 text-center px-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary mb-4">
            <Shield className="h-3.5 w-3.5" />
            Account Setup
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">Choose your role</h1>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm sm:text-base">
            Select how you'll be using SafeDeal. You can always switch roles later from your dashboard settings.
          </p>
        </section>

        <section className="max-w-5xl mx-auto px-4 pb-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Buyer Card */}
            <Card className="relative overflow-hidden border-2 border-transparent hover:border-primary/40 transition-all group">
              <div className="h-1.5 bg-primary w-full" />
              <CardContent className="p-6 sm:p-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <ShoppingBag className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">Buyer</h2>
                    <p className="text-xs text-muted-foreground">Secure purchases</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-6">
                  Make secure purchases with payment protection. Your money is held safely until you confirm receipt of the item as described.
                </p>
                <div className="space-y-4 mb-6">
                  {buyerFeatures.map((f) => (
                    <div key={f.title} className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <f.icon className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{f.title}</p>
                        <p className="text-xs text-muted-foreground">{f.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 mb-6">
                  <p className="text-xs font-semibold text-primary mb-1">Your Responsibility</p>
                  <p className="text-xs text-muted-foreground">
                    You must verify the received item before funds are released. If you don't act within the verification window, SafeDeal will review the transaction on your behalf.
                  </p>
                </div>
                <Button className="w-full" size="lg" disabled={!!submitting} onClick={() => handleSelectRole("buyer")}>
                  {submitting === "buyer" && <Loader2 className="h-4 w-4 animate-spin" />}
                  Continue as Buyer
                </Button>
              </CardContent>
            </Card>

            {/* Seller Card */}
            <Card className="relative overflow-hidden border-2 border-transparent hover:border-success/40 transition-all group">
              <div className="h-1.5 bg-success w-full" />
              <CardContent className="p-6 sm:p-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-12 w-12 rounded-xl bg-success/10 flex items-center justify-center">
                    <Store className="h-6 w-6 text-success" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">Seller</h2>
                    <p className="text-xs text-muted-foreground">Protected transactions</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-6">
                  Create protected transactions and receive secure payments. Build trust with buyers through SafeDeal's transparent verification process.
                </p>
                <div className="space-y-4 mb-6">
                  {sellerFeatures.map((f) => (
                    <div key={f.title} className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center shrink-0 mt-0.5">
                        <f.icon className="h-4 w-4 text-success" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{f.title}</p>
                        <p className="text-xs text-muted-foreground">{f.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg bg-success/5 border border-success/20 p-4 mb-6">
                  <p className="text-xs font-semibold text-success mb-1">Your Responsibility</p>
                  <p className="text-xs text-muted-foreground">
                    Provide accurate item descriptions, fulfill orders promptly, and upload delivery proof. Funds are released after buyer confirmation or verification timeout.
                  </p>
                </div>
                <Button className="w-full bg-success hover:bg-success/90 text-success-foreground" size="lg" disabled={!!submitting} onClick={() => handleSelectRole("seller")}>
                  {submitting === "seller" && <Loader2 className="h-4 w-4 animate-spin" />}
                  Continue as Seller
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-4 pb-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {infoCards.map((card) => (
              <Card key={card.title} className="text-center">
                <CardContent className="p-6">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <card.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground mb-1">{card.title}</h3>
                  <p className="text-xs text-muted-foreground">{card.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-4 pb-10">
          <div className="rounded-xl bg-primary/5 border border-primary/20 p-6 sm:p-8 text-center">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Shield className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-bold text-foreground">Both roles are protected by SafeDeal</h3>
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl mx-auto mb-5">
              Whether you're buying or selling, every transaction is secured through locked agreements, timestamped evidence records, and secure escrow holding.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {[
                { icon: Lock, label: "Locked Agreements" },
                { icon: FileText, label: "Evidence Records" },
                { icon: Vault, label: "Escrow Holding" },
              ].map((chip) => (
                <span key={chip.label} className="inline-flex items-center gap-1.5 rounded-full bg-background border px-3 py-1.5 text-xs font-medium text-foreground">
                  <chip.icon className="h-3.5 w-3.5 text-primary" />
                  {chip.label}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-4 pb-12">
          <div className="rounded-xl border bg-card p-6 flex flex-col sm:flex-row items-center gap-4">
            <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center shrink-0">
              <Lock className="h-5 w-5 text-success" />
            </div>
            <div className="text-center sm:text-left flex-1">
              <h4 className="text-sm font-semibold text-foreground">Your information is secure</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Role selection helps us customize your dashboard and transaction experience. All data is encrypted and protected.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                <Lock className="h-3 w-3" />
                Bank-level encryption
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                <Shield className="h-3 w-3" />
                GDPR compliant
              </span>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default RoleSelection;
