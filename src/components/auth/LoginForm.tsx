import { useState } from "react";
import { useNavigate } from "react-router-dom";
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

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

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

        const { data: roles } = await getUserRoles(data.user.id);

        toast.success("Welcome back!");

        if (roles && roles.length > 0) {
          navigate("/dashboard", { replace: true });
        } else {
          navigate("/role-selection", { replace: true });
        }
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
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
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Checkbox id="remember" />
              <label htmlFor="remember" className="text-sm text-muted-foreground cursor-pointer">
                Remember me
              </label>
            </div>
            <button
              type="button"
              onClick={() => setForgotOpen(true)}
              className="text-sm text-primary hover:underline"
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

      <ForgotPasswordModal open={forgotOpen} onOpenChange={setForgotOpen} />
    </>
  );
};

export default LoginForm;
