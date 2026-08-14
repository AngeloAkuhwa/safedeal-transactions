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
    openWhatsAppShare("Shop my store on SafeDeal — every order is protected by escrow:", richUrl);
  };

  return (
    <div className="bg-card border-2 border-primary/20 rounded-2xl p-6">
      <div className="flex flex-col lg:flex-row items-start gap-6">
        {/* Left content */}
        <div className="flex-1 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 text-primary">
              <LinkIcon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Your Public Storefront</h3>
              <p className="text-xs text-muted-foreground">
                Share this store link in your Instagram bio, WhatsApp, or X profile
              </p>
            </div>
          </div>

          {/* URL row */}
          <div className="flex items-center gap-2 bg-muted rounded-xl p-2 border border-border">
            <Globe className="h-4 w-4 text-muted-foreground ml-2 shrink-0" />
            <span className="flex-1 text-xs font-mono text-muted-foreground truncate">
              {storeUrl}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopy}
              className="gap-1.5 shrink-0"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
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
              <MessageCircle className="h-3.5 w-3.5 text-emerald-500" />
              WhatsApp
            </Button>
          </div>
        </div>

        {/* QR code */}
        <div className="flex flex-col items-center gap-2">
          <div className="bg-white rounded-2xl p-3">
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
