import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Eye, Store, Copy, Share2, Globe, Package, ArrowLeft, MessageCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "@/components/ui/sonner";
import { formatMoney } from "@/lib/format";
import { productShareMetaUrl, storeShareMetaUrl, openWhatsAppShare } from "@/lib/share-urls";

interface PublishSuccessProduct {
  title: string;
  category_name: string | null;
  unit_price: number;
  currency_code: string;
  primary_image_url: string | null;
  slug: string;
}

interface PublishSuccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: PublishSuccessProduct | null;
  storeSlug: string | null;
  onPreview: () => void;
  onViewStore: () => void;
  onBackToStorefront: () => void;
}

export function PublishSuccessModal({
  open,
  onOpenChange,
  product,
  storeSlug,
  onPreview,
  onViewStore,
  onBackToStorefront,
}: PublishSuccessModalProps) {
  const [copied, setCopied] = useState(false);

  if (!product) return null;

  const productUrl = storeSlug && product.slug
    ? `${window.location.origin}/store/${storeSlug}/${product.slug}`
    : null;

  const storeUrl = storeSlug
    ? `${window.location.origin}/store/${storeSlug}`
    : null;

  // Rich-preview links (crawler-friendly) used for WhatsApp / native share.
  const richProductUrl = storeSlug && product.slug ? productShareMetaUrl(storeSlug, product.slug) : null;
  const richStoreUrl = storeSlug ? storeShareMetaUrl(storeSlug) : null;

  const handleCopyLink = async () => {
    if (!productUrl) return;
    await navigator.clipboard.writeText(productUrl);
    setCopied(true);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!richStoreUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "My SafeDeal Store", url: richStoreUrl });
      } catch {
        // user cancelled
      }
    } else {
      await navigator.clipboard.writeText(storeUrl!);
      toast.success("Store link copied to clipboard");
    }
  };

  const handleWhatsApp = () => {
    const url = richProductUrl || richStoreUrl;
    if (!url) return;
    openWhatsAppShare(`${product.title}. Protected by SafeDeal escrow:`, url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden gap-0">
        <DialogTitle className="sr-only">Product Published Successfully</DialogTitle>
        <DialogDescription className="sr-only">Your product is now live on your storefront</DialogDescription>

        {/* Green gradient header */}
        <div className="bg-gradient-to-r from-emerald-500 to-green-500 px-6 py-8 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mb-4">
            <Check className="h-8 w-8 text-white" strokeWidth={3} />
          </div>
          <h2 className="text-xl font-bold text-white">Product Published Successfully!</h2>
          <p className="text-sm text-white/80 mt-1">Your product is now live on your storefront</p>
        </div>

        <div className="p-6 space-y-5">
          {/* Product summary card */}
          <div className="flex items-center gap-4 p-4 rounded-xl border border-border bg-muted/50">
            <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted flex-shrink-0">
              {product.primary_image_url ? (
                <img src={product.primary_image_url} alt={product.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="h-6 w-6 text-muted-foreground/40" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{product.title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {product.category_name && (
                  <span className="text-xs text-muted-foreground">{product.category_name}</span>
                )}
                <span className="text-xs font-bold text-foreground">
                  {formatMoney(product.unit_price, product.currency_code)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs">
                  Published
                </Badge>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs">
                  Public
                </Badge>
              </div>
            </div>
          </div>

          {/* Info banner */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
            <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-foreground">Now Available to Customers</p>
              <p className="text-xs text-muted-foreground">Checkout uses SafeDeal's recorded payment and release flow</p>
            </div>
          </div>

          {/* 2x2 action grid */}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 justify-center" onClick={onPreview}>
              <Eye className="h-3.5 w-3.5" />
              Preview Product
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 justify-center" onClick={onViewStore}>
              <Store className="h-3.5 w-3.5" />
              View Store
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 justify-center" onClick={handleCopyLink}>
              <Copy className="h-3.5 w-3.5" />
              {copied ? "Copied!" : "Copy Link"}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 justify-center" onClick={handleShare}>
              <Share2 className="h-3.5 w-3.5" />
              Share Store
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5 justify-center"
            onClick={handleWhatsApp}
          >
            <MessageCircle className="h-3.5 w-3.5 text-emerald-500" />
            Share on WhatsApp
          </Button>

          {/* Back to storefront */}
          <Button
            className="w-full gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground"
            onClick={onBackToStorefront}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Storefront
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
