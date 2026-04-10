import { Copy, Check, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
    <Card className="rounded-xl border-primary/20 bg-primary/5">
      <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground mb-0.5">Your Public Storefront</p>
          <p className="text-xs text-muted-foreground truncate">{storeUrl}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleCopy} className="gap-1.5">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy Link"}
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={storeUrl} target="_blank" rel="noopener noreferrer" className="gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" />
              View
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
