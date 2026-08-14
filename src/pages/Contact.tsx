import { Link } from "react-router";
import { ArrowLeft, Mail, Clock, ShieldAlert } from "lucide-react";
import { usePageMeta } from "@/hooks/usePageMeta";

const TITLE = "Contact SafeDeal Support";
const DESCRIPTION =
  "Reach SafeDeal support by email, see expected response times, and find out how to raise a problem with a specific protected transaction.";

const SUPPORT_EMAIL = "support@safedeal.example";

export default function Contact() {
  usePageMeta({ title: TITLE, description: DESCRIPTION, path: "/contact" });

  return (
    <main className="min-h-screen bg-background px-4 py-12 text-foreground sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to SafeDeal
        </Link>

        <h1 className="mt-6 text-3xl font-semibold tracking-tight">Contact support</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          SafeDeal is live in Lagos, Nigeria today, with more cities and countries rolling out.
        </p>

        <div className="mt-6 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          Placeholder contact details — replace the support address, hours, and response window with
          your real values before launch.
        </div>

        <div className="mt-8 space-y-4">
          <section className="rounded-lg border border-border p-4">
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <h2 className="text-base font-semibold text-foreground">Email us</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
                    {SUPPORT_EMAIL}
                  </a>
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Include your transaction code (for example SD-2026-000123) so we can find the
                  record straight away. Never send card details, your bank password, or a
                  one-time code to anyone, including us.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border p-4">
            <div className="flex items-start gap-3">
              <Clock className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <h2 className="text-base font-semibold text-foreground">Response time</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  We reply within 1 business day. Support hours are Monday to Friday, 9am – 5pm WAT.
                  Messages sent outside those hours are answered the next business day.
                </p>
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
                  the held funds while the case is reviewed — email does not. You will find the
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