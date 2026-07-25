import { Clock } from "lucide-react";

interface Props {
  module: string;
  description: string;
  planned?: string[];
}

export function ComingSoonPanel({ module, description, planned = [] }: Props) {
  return (
    <div className="rounded-2xl border border-border bg-card p-8">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Clock className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Coming soon
          </div>
          <h2 className="mt-1 text-xl font-semibold text-foreground">{module}</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
          {planned.length > 0 && (
            <>
              <div className="mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                On the roadmap
              </div>
              <ul className="mt-2 space-y-1.5">
                {planned.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-foreground/80">
                    <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-primary/60" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}