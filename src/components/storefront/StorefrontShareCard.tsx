import { Copy, Check, ExternalLink, Globe } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface StorefrontShareCardProps {
  storeSlug: string | null;
}

export function StorefrontShareCard({ storeSlug }: StorefrontShareCardProps) {
  const [copied, setCopied] = useState(false);

  if (!storeSlug) return null;

  const storeUrl = `${window.location.origin}/store/${storeSlug}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(storeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10 text-primary shrink-0">
            <Globe className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Your Public Storefront</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Share this link on your Instagram bio, WhatsApp, or X profile
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex-1 sm:flex-none rounded-lg bg-muted px-3 py-2 text-xs font-mono text-muted-foreground truncate max-w-[280px]">
            {storeUrl}
          </div>
          <Button size="sm" variant="outline" onClick={handleCopy} className="gap-1.5 shrink-0">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button size="sm" variant="outline" asChild className="shrink-0">
            <a href={storeUrl} target="_blank" rel="noopener noreferrer" className="gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" />
              Preview
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
