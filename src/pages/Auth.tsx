import { useState, useEffect } from "react";
import { useSearchParams, Link, useNavigate } from "react-router";
import { getSession } from "@/services/auth.service";
import { getUserRoles } from "@/services/role.service";
import { Shield, ArrowLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AuthInfoPanel from "@/components/auth/AuthInfoPanel";
import LoginForm from "@/components/auth/LoginForm";
import SignupForm from "@/components/auth/SignupForm";
import SecurityReassurance from "@/components/auth/SecurityReassurance";
import EmailVerificationPending from "@/components/auth/EmailVerificationPending";
import BrandedAuthSplash from "@/components/auth/BrandedAuthSplash";

const Auth = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const role = searchParams.get("role");
  const mode = searchParams.get("mode");
  const redirectParam = searchParams.get("redirect");

  const defaultTab = mode === "login" ? "login" : "signup";

  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  // Persist redirect URL so it survives auth + role selection
  useEffect(() => {
    if (redirectParam) {
      sessionStorage.setItem("safedeal_redirect", redirectParam);
    }
  }, [redirectParam]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session } } = await getSession();
      if (!mounted) return;
      if (!session) {
        setCheckingSession(false);
        return;
      }
      const storedRedirect = sessionStorage.getItem("safedeal_redirect");
      if (storedRedirect) {
        sessionStorage.removeItem("safedeal_redirect");
        navigate(storedRedirect, { replace: true });
        return;
      }
      const { data: roles } = await getUserRoles(session.user.id);
      const roleNames = (roles ?? []).map((r: any) => r.role as string);
      if (roleNames.includes("admin")) {
        navigate("/admin/dashboard", { replace: true });
      } else if (roleNames.includes("buyer")) {
        navigate("/dashboard", { replace: true });
      } else if (roleNames.includes("seller")) {
        navigate("/seller", { replace: true });
      } else {
        navigate("/role-selection", { replace: true });
      }
    })();
    return () => { mounted = false; };
  }, [navigate]);

  const subtitleMap: Record<string, string> = {
    buyer: "Sign up to start buying with protection",
    seller: "Sign up to start selling with confidence",
  };

  const handleEmailNotVerified = (email: string) => {
    setVerificationEmail(email);
  };

  const handleGoToLogin = () => {
    setVerificationEmail(null);
  };

  if (checkingSession) {
    return <BrandedAuthSplash />;
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-primary/5 via-background to-success/5">
      {/* Back link - mobile */}
      <div className="lg:hidden p-4">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-11"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>
      </div>

      <div className="flex min-h-[100dvh] items-center justify-center p-4 lg:p-8">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 rounded-2xl border bg-card shadow-xl overflow-hidden">
          {/* Left panel */}
          <AuthInfoPanel />

          {/* Right panel */}
          <div className="p-6 sm:p-8 lg:p-10 flex flex-col justify-center">
            {/* Mobile logo */}
            <Link to="/" className="flex items-center justify-center gap-2 mb-6 lg:hidden hover:opacity-80 transition-opacity min-h-11">
              <Shield className="h-7 w-7 text-primary" />
              <span className="text-xl font-bold text-foreground">SafeDeal</span>
            </Link>

            {verificationEmail ? (
              <EmailVerificationPending
                email={verificationEmail}
                onGoToLogin={handleGoToLogin}
              />
            ) : (
              <Tabs defaultValue={defaultTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="login">Log In</TabsTrigger>
                  <TabsTrigger value="signup">Sign Up</TabsTrigger>
                </TabsList>

                <TabsContent value="login">
                  <div className="mb-6">
                    <h1 className="text-2xl font-bold text-foreground">
                      Welcome back
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                      Log in to manage your transactions
                    </p>
                  </div>
                  <LoginForm onEmailNotVerified={handleEmailNotVerified} />
                  <p className="mt-5 text-center text-sm text-muted-foreground">
                    Don't have an account?{" "}
                    <Link to="/auth" className="text-primary hover:underline font-medium">
                      Sign up
                    </Link>
                  </p>
                </TabsContent>

                <TabsContent value="signup">
                  <div className="mb-6">
                    <h1 className="text-2xl font-bold text-foreground">
                      Create your account
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                      {role && subtitleMap[role]
                        ? subtitleMap[role]
                        : "Join SafeDeal and start transacting securely"}
                    </p>
                  </div>
                  <SignupForm defaultRole={role} onGoToLogin={handleGoToLogin} />
                  <p className="mt-5 text-center text-sm text-muted-foreground">
                    Already have an account?{" "}
                    <Link to="/auth?mode=login" className="text-primary hover:underline font-medium">
                      Log in
                    </Link>
                  </p>
                </TabsContent>
              </Tabs>
            )}

            <SecurityReassurance />

            <p className="mt-6 text-center text-xs text-muted-foreground">
              By creating an account, you agree to receive transaction updates
              and security notifications via email and SMS, and to our{" "}
              <Link to="/legal/terms" className="text-primary hover:underline">Terms of Service</Link>
              {" "}and{" "}
              <Link to="/legal/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
