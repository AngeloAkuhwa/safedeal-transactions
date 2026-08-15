import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { usePageMeta } from "@/hooks/usePageMeta";

const TITLE = "Terms of Service — SafeDeal";
const DESCRIPTION =
  "The terms that govern use of SafeDeal transaction protection, escrow, delivery confirmation, and dispute resolution.";

export default function LegalTerms() {
  usePageMeta({ title: TITLE, description: DESCRIPTION, path: "/legal/terms" });

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

        <h1 className="mt-6 text-3xl font-semibold tracking-tight">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {new Date().getFullYear()}</p>

        <div className="mt-6 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          Placeholder terms — replace with your reviewed legal copy before launch. This text is a
          structural draft only and is not legal advice.
        </div>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground">1. The service</h2>
            <p className="mt-2">
              SafeDeal provides a transaction protection layer. Buyer funds are held in escrow and
              released to the seller only after the agreed delivery and confirmation conditions are
              met, or after a dispute is resolved.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">2. Accounts and verification</h2>
            <p className="mt-2">
              You must provide accurate information and complete the verification steps that apply
              to your role and transaction volume. Access may be limited or suspended where
              verification is incomplete or where activity is flagged for review.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">3. Fees</h2>
            <p className="mt-2">
              A protection fee is applied to each protected transaction and is disclosed before
              payment. Delivery fees arranged directly between buyer and seller are external to the
              protection fee.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">4. Agreements are immutable</h2>
            <p className="mt-2">
              Once a transaction is paid, the agreed terms are locked as an immutable snapshot.
              Changes after that point are handled through the dispute or remediation process, not
              by editing the agreement.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">5. Disputes</h2>
            <p className="mt-2">
              Either party may raise a dispute within the applicable window. SafeDeal reviews the
              evidence submitted by both parties and issues an outcome that determines how the held
              funds are released or refunded.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">6. Prohibited use</h2>
            <p className="mt-2">
              The service may not be used for unlawful goods or services, fraudulent transactions,
              or to circumvent the escrow process once a transaction has been created.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">7. Contact</h2>
            <p className="mt-2">
              Questions about these terms can be sent to the support address published by the
              platform owner.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}