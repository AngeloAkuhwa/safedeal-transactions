import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { usePageMeta } from "@/hooks/usePageMeta";

const TITLE = "Privacy Policy — SafeDeal";
const DESCRIPTION =
  "How SafeDeal collects, uses, and protects personal information across transaction protection and escrow services.";

export default function LegalPrivacy() {
  usePageMeta({ title: TITLE, description: DESCRIPTION, path: "/legal/privacy" });

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

        <h1 className="mt-6 text-3xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {new Date().getFullYear()}</p>

        <div className="mt-6 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          Placeholder policy — replace with your reviewed legal copy before launch. This text is a
          structural draft only and is not legal advice.
        </div>

        <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="text-lg font-semibold text-foreground">1. Information we collect</h2>
            <p className="mt-2">
              We collect the information you provide when you create an account, verify your
              identity, list a product, or complete a protected transaction. This includes your
              name, email address, phone number, payout details, and any identity documents you
              submit for verification.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">2. How we use information</h2>
            <p className="mt-2">
              Information is used to operate escrow and transaction protection, verify participants,
              prevent fraud, resolve disputes, meet legal and regulatory obligations, and
              communicate with you about your transactions.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">3. Sharing</h2>
            <p className="mt-2">
              We share information with payment and payout providers, identity verification
              partners, and delivery partners strictly as needed to complete a transaction. We do
              not sell personal information.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">4. Retention</h2>
            <p className="mt-2">
              Transaction, escrow, and audit records are retained for the period required by
              applicable financial regulations. Identity documents are retained under a data
              minimisation policy and are masked wherever they are displayed.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">5. Your rights</h2>
            <p className="mt-2">
              You may request access to, correction of, or deletion of your personal information,
              subject to the record-keeping obligations that apply to completed financial
              transactions.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground">6. Contact</h2>
            <p className="mt-2">
              Questions about this policy can be sent to the privacy contact address published by
              the platform owner.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}