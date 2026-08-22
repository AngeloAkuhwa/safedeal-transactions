import { Copy, Check, ExternalLink, Globe, Link as LinkIcon, Share2, MessageCircle } from "lucide-react";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { storeUrl as buildStoreUrl, storeShareMetaUrl, openWhatsAppShare } from "@/lib/share-urls";

interface StorefrontShareCardProps {
  storeSlug: string | null;
}

export function StorefrontShareCard({ storeSlug }: StorefrontShareCardProps) {
  const [copied, setCopied] = useState(false);

  if (!storeSlug) return null;

  // "Copy" gives the clean canonical link; WhatsApp gets the rich-preview link.
  const storeUrl = buildStoreUrl(storeSlug);
  const richUrl = storeShareMetaUrl(storeSlug);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(storeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: "My SafeDeal Store", url: richUrl });
    } else {
      handleCopy();
    }
  };

  const handleWhatsApp = () => {
    openWhatsAppShare("Shop my store on SafeDeal: every order is protected by escrow:", richUrl);
  };

  return (
    <div className="rounded-2xl border-2 border-primary/20 bg-card p-4 sm:p-6">
      {/* `items-start` belongs to the lg row only. On a column flex container
          it also applies to the cross axis. Width. So children size to
          their content instead of stretching, and no amount of `min-w-0`
          helps because it is not a min-width problem. That is what took this
          card 228px past a 320px screen. */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Left content: min-w-0 or this column keeps its content's
            min-content width and takes the card 236px past a 320px screen. */}
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <LinkIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-foreground">Your Public Storefront</h3>
              <p className="text-xs text-muted-foreground">
                Share this store link in your Instagram bio, WhatsApp, or X profile
              </p>
            </div>
          </div>

          {/* URL row */}
          <div className="flex items-center gap-2 bg-muted rounded-xl p-2 border border-border">
            <Globe className="h-4 w-4 text-muted-foreground ml-2 shrink-0" />
            {/* min-w-0 is what lets `truncate` actually engage in a flex row. */}
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
              {storeUrl}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopy}
              className="gap-1.5 shrink-0"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>

          {/* Action buttons: three of them do not fit one phone line. */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              asChild
              className="gap-1.5"
            >
              <a href={storeUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                Preview Store
              </a>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleShare}
              className="gap-1.5"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleWhatsApp}
              className="gap-1.5"
            >
              <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
              WhatsApp
            </Button>
          </div>
        </div>

        {/* QR code */}
        <div className="flex w-full flex-col items-center gap-2 lg:w-auto">
          {/* bg-white literally, not a token. A QR code is read by a camera
              looking for dark modules on a light field, so the quiet zone has
              to stay white in dark mode too. Theming this breaks scanning. */}
          <div className="rounded-2xl bg-white p-3">
            <QRCodeSVG
              value={storeUrl}
              size={120}
              bgColor="#ffffff"
              fgColor="#0A0B1E"
              level="M"
            />
          </div>
          <span className="text-xs text-muted-foreground">QR Code</span>
        </div>
      </div>
    </div>
  );
}
