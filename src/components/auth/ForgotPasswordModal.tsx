import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Mail } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { resetPasswordForEmail } from "@/services/auth.service";

const schema = z.object({
  email: z.string().trim().email("Please enter a valid email address").max(255),
});

interface ForgotPasswordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ForgotPasswordModal = ({ open, onOpenChange }: ForgotPasswordModalProps) => {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (values: z.infer<typeof schema>) => {
    setLoading(true);
    try {
      const { error } = await resetPasswordForEmail(
        values.email,
        `${window.location.origin}/reset-password`
      );
      if (error) {
        toast.error(error.message);
        return;
      }
      setSent(true);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setSent(false);
      form.reset();
    }
    onOpenChange(open);
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={handleClose}
      // md:, not sm:. Below 768 this is an edge to edge sheet, and an
      // unqualified max-width would pin it to 448px against the left edge.
      className="md:max-w-md"
      title="Reset your password"
      description={
        sent
          ? "Check your email for a password reset link."
          : "Enter your email and we'll send you a link to reset your password."
      }
    >
      {/* The submit button stays inside the form rather than moving to the
          footer slot: outside the <form> element `type="submit"` stops
          submitting, and pressing return in the email field would be the only
          way left to send the link. */}
      {sent ? (
        <div className="flex flex-col items-center gap-3 py-4">
          <Mail className="h-6 w-6 text-primary" />
          <p className="text-sm text-muted-foreground text-center">
            If an account exists with that email, you'll receive a reset link shortly.
          </p>
          <Button className="w-full md:w-auto" variant="outline" onClick={() => handleClose(false)}>
            Close
          </Button>
        </div>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Address</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="name@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Send Reset Link
            </Button>
          </form>
        </Form>
      )}
    </ResponsiveDialog>
  );
};

export default ForgotPasswordModal;
