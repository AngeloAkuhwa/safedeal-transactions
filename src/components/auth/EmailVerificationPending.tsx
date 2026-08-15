import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Mail, ArrowLeft, Loader2, RefreshCw, CheckCircle2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { resendVerificationEmail, getSession } from "@/services/auth.service";

interface EmailVerificationPendingProps {
  email: string;
  onGoToLogin?: () => void;
}

const EmailVerificationPending = ({ email, onGoToLogin }: EmailVerificationPendingProps) => {
  const navigate = useNavigate();
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);

  const handleResend = async () => {
    setResending(true);
    try {
      const { error } = await resendVerificationEmail(email);
      if (error) {
        if (error.message.includes("already confirmed")) {
          toast.success("Your email is already verified! You can log in.");
        } else {
          toast.error(error.message);
        }
      } else {
        toast.success("Verification email resent. Check your inbox.");
      }
    } catch {
      toast.error("Could not resend email. Please try again.");
    } finally {
      setResending(false);
    }
  };

  const handleCheckVerified = async () => {
    setChecking(true);
    try {
      const { data, error } = await getSession();
      if (error || !data.session) {
        toast.info("Please check your email and click the verification link, then try again.");
      } else if (data.session.user.email_confirmed_at) {
        toast.success("Email verified! Redirecting…");
        navigate("/role-selection");
      } else {
        toast.info("Your email is not verified yet. Please check your inbox.");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex flex-col items-center text-center">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
        <Mail className="h-8 w-8 text-success" />
      </div>

      <h2 className="text-2xl font-bold text-foreground mb-2">Check your email</h2>
      <p className="text-sm text-muted-foreground mb-1">
        We've sent a verification link to
      </p>
      <p className="text-sm font-medium text-foreground mb-6">{email}</p>
      <p className="text-sm text-muted-foreground mb-8">
        Please click the link in your email to activate your account. If you don't see it, check your spam folder.
      </p>

      <div className="w-full space-y-3">
        <Button
          onClick={handleCheckVerified}
          className="w-full"
          size="lg"
          disabled={checking}
        >
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          I've verified my email
        </Button>

        <Button
          variant="outline"
          onClick={handleResend}
          className="w-full"
          size="lg"
          disabled={resending}
        >
          {resending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Resend Verification Email
        </Button>
      </div>

      <div className="mt-6 flex flex-col gap-2 text-sm">
        {onGoToLogin && (
          <button
            type="button"
            onClick={onGoToLogin}
            className="text-primary hover:underline font-medium min-h-11 inline-flex items-center"
          >
            Go to Login
          </button>
        )}
        <Link
          to="/"
          className="inline-flex items-center justify-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Home
        </Link>
      </div>
    </div>
  );
};

export default EmailVerificationPending;
