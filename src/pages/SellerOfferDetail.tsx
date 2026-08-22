import { useState } from "react";
import { ProductImage } from "@/components/common/ProductImage";
import { useParams, Link, useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format as formatDate } from "date-fns";
import {
  Loader2, ArrowLeft, Lock, Copy, MessageSquare, Mail, Package,
  XCircle, RefreshCw, ExternalLink, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { SellerNav } from "@/components/seller/SellerNav";
import { Footer } from "@/components/landing/Footer";
import { toast } from "@/components/ui/sonner";
import {
  getSellerOfferDetail, cancelSellerOffer, reactivateSellerOffer, canModifyOffer,
} from "@/services/seller-offers.service";
import { getSellerDashboard } from "@/services/seller-dashboard.service";
import { formatMoney } from "@/lib/format";

/** Shared timestamp formatter: matches AgreementSnapshotSection / dispute UI. */
function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return formatDate(new Date(iso), "MMM d, yyyy 'at' h:mm a");
  } catch {
    return "—";
  }
}

const statusStyle: Record<string, string> = {
  pending_claim: "bg-muted text-muted-foreground border-border",
  linked: "bg-primary/10 text-primary border-primary/20",
  claimed: "bg-warning/10 text-warning border-warning/20",
  purchased: "bg-success/10 text-success border-success/20",
  expired: "bg-destructive/10 text-destructive border-destructive/20",
  cancelled: "bg-muted text-muted-foreground border-border",
};

export default function SellerOfferDetail() {
  const { offerId } = useParams<{ offerId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: navData } = useQuery({ queryKey: ["seller-dashboard"], queryFn: getSellerDashboard, staleTime: 60_000 });

  const { data: offer, isLoading, isError } = useQuery({
    queryKey: ["seller-offer-detail", offerId],
    queryFn: () => getSellerOfferDetail(offerId!),
    enabled: !!offerId,
  });

  const cancelMut = useMutation({
    mutationFn: () => cancelSellerOffer(offerId!),
    onSuccess: () => {
      toast.success("Offer cancelled");
      qc.invalidateQueries({ queryKey: ["seller-offers"] });
      qc.invalidateQueries({ queryKey: ["seller-offer-detail", offerId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reactivateMut = useMutation({
    mutationFn: () => reactivateSellerOffer(offerId!, 7),
    onSuccess: () => {
      toast.success("Offer reactivated with a new link");
      qc.invalidateQueries({ queryKey: ["seller-offers"] });
      qc.invalidateQueries({ queryKey: ["seller-offer-detail", offerId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col">
        <SellerNav sellerName={navData?.seller?.full_name ?? "Seller"} avatarUrl={navData?.seller?.avatar_url ?? null} />
        <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        <Footer />
      </div>
    );
  }

  if (isError || !offer) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col">
        <SellerNav sellerName={navData?.seller?.full_name ?? "Seller"} avatarUrl={navData?.seller?.avatar_url ?? null} />
        <div className="flex-1 p-8 text-destructive">Failed to load offer.</div>
        <Footer />
      </div>
    );
  }

  const offerUrl = `${window.location.origin}/offer/${offer.offer_token}`;
  const total = offer.items.reduce((s, it) => s + Number(it.unit_price_snapshot) * it.quantity, 0);
  const currency = offer.items[0]?.currency_code ?? "NGN";
  const buyerLabel = offer.buyer?.full_name ?? offer.buyer_email ?? "Intended buyer";
  const { canCancel, canRegenerate, reason } = canModifyOffer(offer);

  const handleCopy = () => {
    navigator.clipboard.writeText(offerUrl);
    toast.success("Link copied");
  };

  const shareText = `Hi ${buyerLabel}, here's your private SafeDeal offer: ${offerUrl}`;

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <SellerNav sellerName={navData?.seller?.full_name ?? "Seller"} avatarUrl={navData?.seller?.avatar_url ?? null} />

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/seller/offers"><ArrowLeft className="h-4 w-4 mr-1.5" /> Back to private offers</Link>
        </Button>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Lock className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-bold text-foreground">Private Offer</h1>
              <Badge variant="outline" className={statusStyle[offer.status] ?? ""}>{offer.status.replace("_", " ")}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">For {buyerLabel}</p>
          </div>

          {offer.transaction && (
            <Button asChild variant="outline" size="sm">
              <Link to={`/seller/transactions/${offer.transaction.id}`}>
                <ExternalLink className="h-4 w-4 mr-1.5" /> View linked transaction
              </Link>
            </Button>
          )}
        </div>

        {/* Share Link */}
        {["pending_claim", "linked", "claimed"].includes(offer.status) && (
          <Card>
            <CardContent className="p-5 space-y-3">
              <h3 className="font-semibold text-foreground">Share offer link</h3>
              <div className="flex gap-2">
                <Input readOnly value={offerUrl} className="font-mono text-xs" />
                <Button onClick={handleCopy} className="gap-1.5"><Copy className="h-4 w-4" /> Copy</Button>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`)}>
                  <MessageSquare className="h-4 w-4 mr-1.5 text-success" /> WhatsApp
                </Button>
                <Button variant="outline" size="sm" onClick={() => window.open(`mailto:${offer.buyer?.email ?? offer.buyer_email ?? ""}?subject=${encodeURIComponent("Your private SafeDeal offer")}&body=${encodeURIComponent(shareText)}`)}>
                  <Mail className="h-4 w-4 mr-1.5 text-primary" /> Email
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Lifecycle */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-5 space-y-2 text-sm">
              <h3 className="font-semibold text-foreground mb-2">Lifecycle</h3>
              <Row label="Created" value={fmtDateTime(offer.created_at)} />
              <Row label="Linked at" value={fmtDateTime(offer.linked_at)} />
              <Row label="Claimed at" value={fmtDateTime(offer.claimed_at)} />
              <Row label="Purchased at" value={fmtDateTime(offer.purchased_at)} />
              <Row label="Expires" value={fmtDateTime(offer.expires_at)} />
              {offer.cancelled_at && <Row label="Cancelled at" value={fmtDateTime(offer.cancelled_at)} />}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-2 text-sm">
              <h3 className="font-semibold text-foreground mb-2">Buyer</h3>
              <Row label="Intended email" value={offer.buyer_email ?? "—"} />
              <Row label="Linked account" value={offer.buyer?.full_name ? `${offer.buyer.full_name} (${offer.buyer.email})` : "Not linked"} />
              {offer.transaction && (
                <>
                  <Row label="Transaction status" value={offer.transaction.status.replace(/_/g, " ")} />
                  <Row label="Money status" value={offer.transaction.money_status.replace(/_/g, " ")} />
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Bundle items */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-foreground">Bundle items ({offer.items.length})</h3>
              <p className="text-sm font-bold text-foreground">Total: {formatMoney(total, currency)}</p>
            </div>
            <div className="space-y-3">
              {offer.items.map((it) => (
                <div key={it.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border border-border">
                  <div className="h-12 w-12 rounded-md bg-muted overflow-hidden flex items-center justify-center flex-shrink-0">
                    {it.primary_media_url
                      ? <ProductImage url={it.primary_media_url} alt="" rendition="thumb" sizes="80px" />
                      : <Package className="h-5 w-5 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{it.product_title}</p>
                    {it.short_description && (
                      <p className="text-xs text-muted-foreground line-clamp-1">{it.short_description}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">
                      {formatMoney(Number(it.unit_price_snapshot), it.currency_code)}
                    </p>
                    <p className="text-xs text-muted-foreground">× {it.quantity}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold text-foreground mb-3">Actions</h3>
            {reason && (
              <div className="flex items-start gap-2 p-3 mb-3 rounded-lg bg-warning/10 border border-warning/20 text-sm">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
                <p className="text-muted-foreground">{reason}</p>
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              {canCancel && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10">
                      <XCircle className="h-4 w-4" /> Cancel offer
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel this private offer?</AlertDialogTitle>
                      <AlertDialogDescription>
                        The buyer link will stop working immediately and the underlying products will be archived. This cannot be undone, but you can reactivate the offer later with a new link.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep offer</AlertDialogCancel>
                      <AlertDialogAction onClick={() => cancelMut.mutate()} disabled={cancelMut.isPending}>
                        {cancelMut.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                        Cancel offer
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              {canRegenerate && (
                <Button variant="outline" className="gap-1.5" onClick={() => reactivateMut.mutate()} disabled={reactivateMut.isPending}>
                  {reactivateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Reactivate with new link (7d)
                </Button>
              )}
              <Button variant="outline" className="gap-1.5" onClick={() => navigate("/seller/transactions/new")}>
                Create another offer
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground text-right">{value}</span>
    </div>
  );
}
