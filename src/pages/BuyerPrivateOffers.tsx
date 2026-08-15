import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Lock, Clock, ChevronDown, ChevronUp, Package, ArrowRight, AlertTriangle } from "lucide-react";
import { BuyerNav } from "@/components/dashboard/BuyerNav";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getBuyerOffers, type BuyerOffer } from "@/services/buyer-offers.service";
import { getBuyerProfile } from "@/services/profile.service";
import { formatMoney } from "@/lib/format";

export default function BuyerPrivateOffers() {
  const [showPast, setShowPast] = useState(false);

  const { data: profile } = useQuery({ queryKey: ["buyer-profile"], queryFn: getBuyerProfile, staleTime: 60_000 });
  const { data, isLoading, isError } = useQuery({ queryKey: ["buyer-offers"], queryFn: getBuyerOffers });

  const buyerName = profile?.profile?.full_name || "Buyer";
  const avatarUrl = profile?.profile?.avatar_url || null;

  return (
    <div className="min-h-[100dvh] bg-background">
      <BuyerNav buyerName={buyerName} avatarUrl={avatarUrl} />

      <div className="sd-page sd-page-y">
        <div className="flex items-center gap-2 mb-1">
          <Lock className="h-4 w-4 text-primary" />
          <h1 className="sd-page-title">Private Offers</h1>
        </div>
        <p className="sd-page-sub mb-4">Personalized offers sent directly to you by sellers.</p>

        {isLoading && (
          <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
        )}

        {isError && (
          <Card><CardContent className="p-6 text-center text-destructive">Failed to load offers.</CardContent></Card>
        )}

        {data && data.active.length === 0 && data.past.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center space-y-2">
              <Package className="h-10 w-10 text-muted-foreground mx-auto" />
              <h3 className="text-base font-semibold text-foreground">No private offers yet</h3>
              <p className="text-sm text-muted-foreground">When a seller sends you a personalized offer, it will appear here.</p>
            </CardContent>
          </Card>
        )}

        {data && data.active.length > 0 && (
          <div className="space-y-4 mb-8">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Active offers ({data.active.length})</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.active.map((offer) => <OfferCard key={offer.id} offer={offer} />)}
            </div>
          </div>
        )}

        {data && data.past.length > 0 && (
          <div className="space-y-3">
            <button
              onClick={() => setShowPast((v) => !v)}
              className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
            >
              {showPast ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Past offers ({data.past.length})
            </button>
            {showPast && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.past.map((offer) => <OfferCard key={offer.id} offer={offer} muted />)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function OfferCard({ offer, muted }: { offer: BuyerOffer; muted?: boolean }) {
  const product = offer.product;
  const seller = offer.seller;

  const statusBadge = () => {
    switch (offer.status) {
      case "linked": return <Badge className="bg-primary/10 text-primary border-primary/30">New</Badge>;
      case "claimed": return <Badge className="bg-success/10 text-success border-success/30">Claimed</Badge>;
      case "purchased": return <Badge variant="secondary">Purchased</Badge>;
      case "expired": return <Badge variant="outline" className="text-muted-foreground">Expired</Badge>;
      case "cancelled": return <Badge variant="outline" className="text-muted-foreground">Cancelled</Badge>;
      default: return <Badge variant="outline">{offer.status}</Badge>;
    }
  };

  return (
    <Card className={`overflow-hidden hover:shadow-md transition-shadow ${muted ? "opacity-70" : ""}`}>
      {product?.primary_image_url ? (
        <div className="aspect-video bg-muted">
          <img src={product.primary_image_url} alt={product.title} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="aspect-video bg-muted flex items-center justify-center">
          <Package className="h-10 w-10 text-muted-foreground" />
        </div>
      )}
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-foreground line-clamp-2">{product?.title || "Untitled"}</h3>
          {statusBadge()}
        </div>
        <p className="text-xs text-muted-foreground">Offer from <span className="font-medium text-foreground">{seller?.full_name}</span></p>
        <div className="flex items-baseline justify-between border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">Price</span>
          <span className="text-lg font-bold text-foreground">
            {formatMoney(Number(product?.unit_price || 0), product?.currency_code || "NGN")}
          </span>
        </div>
        {offer.expires_at && offer.status !== "expired" && offer.status !== "purchased" && (
          <div className="flex items-center gap-1.5 text-xs text-warning">
            <Clock className="h-3 w-3" />
            Expires {new Date(offer.expires_at).toLocaleDateString()}
          </div>
        )}
        {!muted && offer.status !== "purchased" && (
          <Button asChild size="sm" className="w-full">
            <Link to={`/offer/${offer.offer_token}`}>
              {offer.status === "claimed" ? "Continue" : "View offer"}
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Link>
          </Button>
        )}
        {offer.transaction && (
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link to={`/dashboard/transactions/${offer.transaction.id}`}>View transaction</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
