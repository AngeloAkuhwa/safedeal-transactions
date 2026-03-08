import { useSearchParams, Link } from "react-router-dom";
import { Shield, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const Auth = () => {
  const [searchParams] = useSearchParams();
  const role = searchParams.get("role");
  const mode = searchParams.get("mode");

  const isLogin = mode === "login";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <Link to="/" className="mb-8 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Back to home
      </Link>
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-lg">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Shield className="h-8 w-8 text-primary" />
          <span className="text-2xl font-bold text-foreground">SafeDeal</span>
        </div>
        <h1 className="mb-2 text-center text-xl font-semibold text-foreground">
          {isLogin ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mb-6 text-center text-sm text-muted-foreground">
          {isLogin
            ? "Log in to manage your transactions"
            : role === "buyer"
              ? "Sign up to start buying with protection"
              : role === "seller"
                ? "Sign up to start selling with confidence"
                : "Join SafeDeal to buy and sell securely"}
        </p>
        <div className="space-y-4">
          <p className="rounded-lg bg-muted p-4 text-center text-sm text-muted-foreground">
            Authentication screen coming soon. This is a placeholder.
          </p>
          <Button className="w-full" disabled>
            {isLogin ? "Log In" : "Sign Up"}
          </Button>
        </div>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {isLogin ? (
            <>Don't have an account?{" "}<Link to="/auth" className="text-primary hover:underline">Sign up</Link></>
          ) : (
            <>Already have an account?{" "}<Link to="/auth?mode=login" className="text-primary hover:underline">Log in</Link></>
          )}
        </p>
      </div>
    </div>
  );
};

export default Auth;
