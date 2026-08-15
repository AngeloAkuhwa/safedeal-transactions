import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Shield, Eye, EyeOff, Loader2, MailCheck, AlertTriangle } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { supabase } from "@/integrations/supabase/client";
import { updatePassword } from "@/services/auth.service";
import { isInternalUser } from "@/lib/internal-role";
import { BlockSkeleton } from "@/components/common/PageSkeleton";

const schema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128)
      .regex(/^(?=.*[a-zA-Z])(?=.*\d)/, "Must contain letters and numbers"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

const AcceptInvite = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">("checking");
  const [email, setEmail] = useState<string | null>(null);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });

  useEffect(() => {
    let cancelled = false;

    const resolveSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session?.user) {
        setEmail(data.session.user.email ?? null);
        setStatus("ready");
      }
    };

    // Session may not be available on first tick — supabase-js consumes the
    // invite hash asynchronously. Listen and also poll briefly.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (cancelled) return;
      if (session?.user) {
        setEmail(session.user.email ?? null);
        setStatus("ready");
      }
    });

    resolveSession();
    const timer = window.setTimeout(() => {
      if (!cancelled) {
        setStatus((s) => (s === "checking" ? "invalid" : s));
      }
    }, 3500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  const onSubmit = async (values: z.infer<typeof schema>) => {
    setLoading(true);
    try {
      const { error } = await updatePassword(values.password);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Password set — welcome to SafeDeal!");

      // Route internal team members to the admin dashboard; everyone else
      // continues through the normal role-selection flow.
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (uid) {
        const internal = await isInternalUser(uid);
        if (internal) {
          // Promote invited internal user to active on first successful
          // password-set. Guarded by `.eq("status","invited")` so we never
          // clobber an existing suspended/deactivated row.
          try {
            await supabase
              .from("internal_users" as any)
              .update({
                status: "active",
                invitation_status: "accepted",
              })
              .eq("id", uid)
              .eq("status", "invited");
          } catch { /* non-fatal — badge will flip on next admin refresh */ }
          navigate("/admin/dashboard", { replace: true });
          return;
        }
      }
      navigate("/role-selection", { replace: true });
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-success/5 p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-xl">
        <div className="flex items-center justify-center gap-2 mb-6">
          <Shield className="h-7 w-7 text-primary" />
          <span className="text-xl font-bold text-foreground">SafeDeal</span>
        </div>

        {status === "checking" && (
          <div className="space-y-3 py-6">
            <BlockSkeleton label="Checking your invitation" lines={3} />
            <p className="text-center text-sm text-muted-foreground">Verifying your invitation…</p>
          </div>
        )}

        {status === "invalid" && (
          <div className="flex flex-col items-center py-6 text-center">
            <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center mb-3">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <h1 className="text-lg font-semibold text-foreground mb-1">
              Invitation link invalid or expired
            </h1>
            <p className="text-sm text-muted-foreground mb-5">
              This invitation link has already been used or is no longer valid. Ask your
              administrator to send a new invitation.
            </p>
            <Button asChild className="w-full">
              <Link to="/auth?mode=login">Go to log in</Link>
            </Button>
          </div>
        )}

        {status === "ready" && (
          <>
            <div className="flex items-center justify-center h-11 w-11 rounded-full bg-primary/10 mx-auto mb-4">
              <MailCheck className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground text-center mb-1">
              Welcome to SafeDeal
            </h1>
            <p className="text-sm text-muted-foreground text-center mb-4">
              Set a password to activate your team account
            </p>
            {email && (
              <div className="mb-6 rounded-lg border bg-muted/40 px-3 py-2 text-center text-sm text-foreground">
                {email}
              </div>
            )}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showPw ? "text" : "password"}
                            placeholder="Enter new password"
                            autoComplete="new-password"
                            {...field}
                          />
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center justify-center text-muted-foreground hover:text-foreground min-h-11 min-w-11"
                            onClick={() => setShowPw(!showPw)}
                            aria-label={showPw ? "Hide password" : "Show password"}
                          >
                            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <p className="text-xs text-muted-foreground mt-1">
                        At least 8 characters with letters and numbers
                      </p>
                      <FormMessage />
                    </FormItem>
                  )} />

                <FormField
                  control={form.control}
                  name="confirm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showConfirm ? "text" : "password"}
                            placeholder="Confirm new password"
                            autoComplete="new-password"
                            {...field}
                          />
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center justify-center text-muted-foreground hover:text-foreground min-h-11 min-w-11"
                            onClick={() => setShowConfirm(!showConfirm)}
                            aria-label={showConfirm ? "Hide password" : "Show password"}
                          >
                            {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Activate account
                </Button>
              </form>
            </Form>
          </>
        )}
      </div>
    </div>
  );
};

export default AcceptInvite;