import { Copy, Check, ExternalLink, Globe, Link as LinkIcon, Share2 } from "lucide-react";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
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

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: "My SafeDeal Store", url: storeUrl });
    } else {
      handleCopy();
    }
  };

  return (
    <div className="bg-[#1E2040]/60 backdrop-blur-xl border-2 border-blue-500/20 rounded-[24px] p-6">
      <div className="flex flex-col lg:flex-row items-start gap-6">
        {/* Left content */}
        <div className="flex-1 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-blue-500/10 text-blue-400">
              <LinkIcon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Your Public Storefront</h3>
              <p className="text-xs text-[#8C8EAA]">
                Share this store link in your Instagram bio, WhatsApp, or X profile
              </p>
            </div>
          </div>

          {/* URL row */}
          <div className="flex items-center gap-2 bg-[#151730] rounded-xl p-2 border border-[#30344F]">
            <Globe className="h-4 w-4 text-[#8C8EAA] ml-2 shrink-0" />
            <span className="flex-1 text-xs font-mono text-[#8C8EAA] truncate">
              {storeUrl}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopy}
              className="gap-1.5 shrink-0 bg-[#1E2040] border-[#30344F] text-[#8C8EAA] hover:text-white hover:bg-[#30344F]"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              asChild
              className="gap-1.5 bg-[#1E2040] border-[#30344F] text-[#8C8EAA] hover:text-white hover:bg-[#30344F]"
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
              className="gap-1.5 bg-[#1E2040] border-[#30344F] text-[#8C8EAA] hover:text-white hover:bg-[#30344F]"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
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
          <span className="text-xs text-[#8C8EAA]">QR Code</span>
        </div>
      </div>
    </div>
  );
}
