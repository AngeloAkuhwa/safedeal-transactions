const statuses = [
  { label: "DRAFT", caption: "Transaction being created", tone: "muted" },
  { label: "AWAITING PAYMENT", caption: "Waiting for buyer to pay", tone: "warning" },
  { label: "FUNDS HELD", caption: "Payment secured in escrow", tone: "success" },
  { label: "IN TRANSIT", caption: "Item being delivered", tone: "primary" },
  { label: "AWAITING VERIFICATION", caption: "Buyer needs to confirm", tone: "warning" },
  { label: "COMPLETED", caption: "Funds released to seller", tone: "success" },
  { label: "DISPUTED", caption: "Under admin review", tone: "destructive" },
  { label: "CANCELLED", caption: "Transaction terminated", tone: "muted" },
] as const;

const toneClasses: Record<string, { wrapper: string; pill: string }> = {
  muted: {
    wrapper: "bg-muted/40 border-border",
    pill: "bg-muted text-muted-foreground",
  },
  warning: {
    wrapper: "bg-warning/5 border-warning/20",
    pill: "bg-warning/15 text-warning",
  },
  success: {
    wrapper: "bg-success/5 border-success/20",
    pill: "bg-success/15 text-success",
  },
  primary: {
    wrapper: "bg-primary/5 border-primary/20",
    pill: "bg-primary/15 text-primary",
  },
  destructive: {
    wrapper: "bg-destructive/5 border-destructive/20",
    pill: "bg-destructive/15 text-destructive",
  },
};

export function StatusBadgesSection() {
  return (
    <section className="bg-background py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center sm:mb-12">
          <h2 className="mb-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Clear status indicators at every step
          </h2>
          <p className="text-base text-muted-foreground">
            Always know exactly where your transaction stands.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statuses.map((s) => {
            const tone = toneClasses[s.tone];
            return (
              <div
                key={s.label}
                className={`rounded-xl border p-6 text-center ${tone.wrapper}`}
              >
                <div
                  className={`mb-3 inline-flex rounded-full px-3 py-1 text-[11px] font-bold tracking-wide ${tone.pill}`}
                >
                  {s.label}
                </div>
                <p className="text-sm text-muted-foreground">{s.caption}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}