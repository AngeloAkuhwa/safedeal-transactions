import { Link, useSearchParams } from "react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Clock, ShieldAlert, Loader2, CheckCircle2 } from "lucide-react";
import { z } from "zod";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { submitContactMessage, type ContactTopic } from "@/services/contact.service";
import {
  SUPPORT_HOURS,
  SUPPORT_RESPONSE_PROMISE,
  SUPPORT_RESPONSE_TARGET,
} from "@/lib/support/support-copy";

const TITLE = "Contact SafeDeal Support";
const DESCRIPTION =
  "Send SafeDeal support a message, see expected response times, and find out how to raise a problem with a specific protected transaction.";

const TOPICS: { value: ContactTopic; label: string }[] = [
  { value: "general", label: "General question" },
  { value: "transaction", label: "Problem with a transaction" },
  { value: "payment", label: "Payment or card issue" },
  { value: "dispute", label: "Dispute help" },
  { value: "account", label: "Account or verification" },
  { value: "report_issue", label: "Report an issue" },
];

const contactSchema = z.object({
  full_name: z.string().trim().min(1, "Your name is required").max(120, "Name is too long"),
  email: z.string().trim().email("Enter a valid email address").max(255),
  topic: z.string().min(1),
  transaction_reference: z.string().trim().max(64).optional(),
  message: z
    .string()
    .trim()
    .min(10, "Please describe the issue in at least 10 characters")
    .max(4000, "Message must be under 4000 characters"),
});

export default function Contact() {
  usePageMeta({ title: TITLE, description: DESCRIPTION, path: "/contact" });
  const [params] = useSearchParams();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<ContactTopic>(
    (TOPICS.find((t) => t.value === params.get("topic"))?.value ?? "general") as ContactTopic,
  );
  const [reference, setReference] = useState(params.get("ref") ?? "");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  // Prefill identity for signed-in users so they don't retype it.
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active || !data.user) return;
      setEmail((prev) => prev || data.user!.email || "");
      const name = (data.user.user_metadata as Record<string, unknown> | null)?.full_name;
      if (typeof name === "string") setFullName((prev) => prev || name);
    });
    return () => {
      active = false;
    };
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = contactSchema.safeParse({
      full_name: fullName,
      email,
      topic,
      transaction_reference: reference,
      message,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setSending(true);
    try {
      const result = await submitContactMessage({
        full_name: parsed.data.full_name,
        email: parsed.data.email,
        topic,
        transaction_reference: parsed.data.transaction_reference || null,
        message: parsed.data.message,
      });
      setAcknowledged(result.acknowledged);
      setSent(true);
      setMessage("");
      toast.success("Message sent. Our team has been notified.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send your message");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-background px-4 py-12 text-foreground sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground min-h-11"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to SafeDeal
        </Link>

        <h1 className="mt-6 h-page font-semibold">Contact support</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          SafeDeal is live in Lagos, Nigeria today, with more cities and countries rolling out.
        </p>

        <div className="mt-8 space-y-4">
          <section className="rounded-lg border border-border p-4">
            <h2 className="text-base font-semibold text-foreground">Send us a message</h2>
            {sent ? (
              <div className="mt-4 flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Message received</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {acknowledged
                      ? `We emailed a confirmation to ${email}. Support replies within ${SUPPORT_RESPONSE_TARGET} (${SUPPORT_HOURS}).`
                      : `Our support team has been notified and will reply to ${email} within ${SUPPORT_RESPONSE_TARGET} (${SUPPORT_HOURS}).`}
                  </p>
                  <Button variant="outline" className="mt-3" onClick={() => setSent(false)}>
                    Send another message
                  </Button>
                </div>
              </div>
            ) : (
              <form className="mt-4 space-y-4" onSubmit={onSubmit} noValidate>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-name">Your name</Label>
                    <Input
                      id="contact-name"
                      value={fullName}
                      maxLength={120}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                    {errors.full_name && (
                      <p className="text-xs text-destructive">{errors.full_name}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-email">Email</Label>
                    <Input
                      id="contact-email"
                      type="email"
                      value={email}
                      maxLength={255}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-topic">Topic</Label>
                    <Select value={topic} onValueChange={(v) => setTopic(v as ContactTopic)}>
                      <SelectTrigger id="contact-topic">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TOPICS.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-ref">Transaction reference (optional)</Label>
                    <Input
                      id="contact-ref"
                      value={reference}
                      maxLength={64}
                      placeholder="SD-2026-000123"
                      onChange={(e) => setReference(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="contact-message">How can we help?</Label>
                  <Textarea
                    id="contact-message"
                    rows={6}
                    value={message}
                    maxLength={4000}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                  {errors.message && <p className="text-xs text-destructive">{errors.message}</p>}
                </div>

                <p className="text-xs text-muted-foreground">
                  Never send card details, your bank password, or a one-time code. Not even to us.
                </p>

                <Button type="submit" disabled={sending} className="w-full sm:w-auto">
                  {sending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Sending…
                    </>
                  ) : (
                    "Send message"
                  )}
                </Button>
              </form>
            )}
          </section>

          <section className="rounded-lg border border-border p-4">
            <div className="flex items-start gap-3">
              <Clock className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <h2 className="text-base font-semibold text-foreground">Response time</h2>
                <p className="mt-1 text-sm text-muted-foreground">{SUPPORT_RESPONSE_PROMISE}</p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border p-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Problem with a transaction?
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Open a dispute from the transaction itself instead of emailing. A dispute freezes
                  the held funds while the case is reviewed. Email does not. You will find the
                  option on the transaction while the money is still in escrow.
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  See the{" "}
                  <Link to="/legal/refund-policy" className="text-primary hover:underline">
                    refund &amp; dispute policy
                  </Link>{" "}
                  for what happens next and the timelines involved.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}