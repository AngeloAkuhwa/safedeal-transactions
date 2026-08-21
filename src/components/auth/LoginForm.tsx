import { useState } from "react";
import { useNavigate } from "react-router";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import ForgotPasswordModal from "./ForgotPasswordModal";
import { signIn } from "@/services/auth.service";
import { invalidateOldSessions, createSession } from "@/services/session.service";
import { getUserRoles } from "@/services/role.service";
import { getAal, listFactors, verifyFactor, consumeRecoveryCode } from "@/services/mfa.service";
import { Label } from "@/components/ui/label";

const loginSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address").max(255),
  password: z.string().min(1, "Password is required").max(128),
});

type LoginValues = z.infer<typeof loginSchema>;

interface LoginFormProps {
  onEmailNotVerified?: (email: string) => void;
}

const LoginForm = ({ onEmailNotVerified }: LoginFormProps) => {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  // Step-up state: only ever entered when the signed-in user already has a
  // verified factor. Consumer routes never trigger this. It lives on /auth.
  const [stepUp, setStepUp] = useState<{ userId: string; factorId: string } | null>(null);
  const [stepUpCode, setStepUpCode] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [stepUpBusy, setStepUpBusy] = useState(false);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const finishLogin = async (userId: string) => {
    const { data: roles } = await getUserRoles(userId);
    toast.success("Welcome back!");
    if (roles && roles.length > 0) {
      const storedRedirect = sessionStorage.getItem("safedeal_redirect");
      if (storedRedirect) {
        sessionStorage.removeItem("safedeal_redirect");
        navigate(storedRedirect, { replace: true });
        return;
      }
      const roleNames = roles.map((r: any) => r.role);
      const destination = roleNames.includes("admin")
        ? "/admin/dashboard"
        : roleNames.includes("seller") && !roleNames.includes("buyer")
        ? "/seller"
        : "/dashboard";
      navigate(destination, { replace: true });
    } else {
      navigate("/role-selection", { replace: true });
    }
  };

  const handleStepUp = async () => {
    if (!stepUp) return;
    setStepUpBusy(true);
    try {
      if (recoveryMode) {
        await consumeRecoveryCode(stepUpCode);
        toast.success("Recovery code accepted. Set up two-factor authentication again.");
        await finishLogin(stepUp.userId);
      } else {
        await verifyFactor(stepUp.factorId, stepUpCode);
        await finishLogin(stepUp.userId);
      }
      setStepUp(null);
      setStepUpCode("");
      setRecoveryMode(false);
    } catch (err) {
      toast.error((err as Error).message || "That code was not correct");
    } finally {
      setStepUpBusy(false);
    }
  };

  const onSubmit = async (values: LoginValues) => {
    setLoading(true);
    try {
      const { data, error } = await signIn(values.email, values.password);

      if (error) {
        if (error.message.includes("Invalid login")) {
          toast.error("Invalid email or password");
        } else if (error.message.includes("Email not confirmed")) {
          if (onEmailNotVerified) {
            onEmailNotVerified(values.email);
          } else {
            toast.error("Please verify your email before logging in");
          }
        } else {
          toast.error(error.message);
        }
        return;
      }

      if (data.user && data.session) {
        await invalidateOldSessions(data.user.id);
        await createSession(data.user.id, data.session.access_token);

        // Step up to aal2 when: and only when. This account has a verified
        // factor. Users without 2FA continue straight through, unchanged.
        try {
          const aal = await getAal();
          if (aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
            const factors = await listFactors();
            const verified = factors.find((f) => f.status === "verified");
            if (verified) {
              setStepUp({ userId: data.user.id, factorId: verified.id });
              return;
            }
          }
        } catch {
          /* AAL read failure must not block a normal login */
        }

        await finishLogin(data.user.id);
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {stepUp ? (
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Two-step verification</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {recoveryMode
                ? "Enter one of your saved recovery codes."
                : "Enter the 6-digit code from your authenticator app."}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="stepUpCode">{recoveryMode ? "Recovery code" : "Authentication code"}</Label>
            <Input
              id="stepUpCode"
              autoComplete="one-time-code"
              inputMode={recoveryMode ? "text" : "numeric"}
              maxLength={recoveryMode ? 12 : 6}
              value={stepUpCode}
              onChange={(e) =>
                setStepUpCode(recoveryMode ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, ""))
              }
              placeholder={recoveryMode ? "XXXXX-XXXXX" : "000000"}
            />
          </div>
          <Button className="w-full" size="lg" onClick={handleStepUp} disabled={stepUpBusy || !stepUpCode}>
            {stepUpBusy && <Loader2 className="h-4 w-4 animate-spin" />}
            Verify
          </Button>
          <button
            type="button"
            onClick={() => { setRecoveryMode(!recoveryMode); setStepUpCode(""); }}
            className="w-full text-sm text-primary hover:underline"
          >
            {recoveryMode ? "Use my authenticator app instead" : "Use a recovery code"}
          </button>
        </div>
      ) : (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email Address</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="name@example.com"
                    autoComplete="email"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      {...field}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 inline-flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground min-h-11"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Checkbox id="remember" />
              <label htmlFor="remember" className="text-sm text-muted-foreground cursor-pointer min-h-11 inline-flex items-center">
                Remember me
              </label>
            </div>
            <button
              type="button"
              onClick={() => setForgotOpen(true)}
              className="text-sm text-primary hover:underline min-h-11 inline-flex items-center"
            >
              Forgot password?
            </button>
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Log In
          </Button>
        </form>
      </Form>
      )}

      <ForgotPasswordModal open={forgotOpen} onOpenChange={setForgotOpen} />
    </>
  );
};

export default LoginForm;
