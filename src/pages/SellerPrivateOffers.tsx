import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Lock, Search, Plus, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SellerNav } from "@/components/seller/SellerNav";
import { Footer } from "@/components/landing/Footer";
import { listSellerOffers, type SellerOffer } from "@/services/seller-offers.service";
import { getSellerDashboard } from "@/services/seller-dashboard.service";
import { formatMoney } from "@/lib/format";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "pending_claim", label: "Pending claim" },
  { value: "linked", label: "Linked" },
  { value: "claimed", label: "Claimed" },
  { value: "purchased", label: "Purchased" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
];

const statusStyle: Record<string, string> = {
  pending_claim: "bg-muted text-muted-foreground border-border",
  linked: "bg-primary/10 text-primary border-primary/20",
  claimed: "bg-success/10 text-success border-success/20",
  purchased: "bg-success/10 text-success border-success/20",
  expired: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-muted text-muted-foreground border-border",
};

export default function SellerPrivateOffers() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data: navData } = useQuery({ queryKey: ["seller-dashboard"], queryFn: getSellerDashboard, staleTime: 60_000 });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["seller-offers"],
    queryFn: listSellerOffers,
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    let list = data?.offers ?? [];
    if (statusFilter !== "all") list = list.filter((o) => o.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((o) =>
        o.buyer_email?.toLowerCase().includes(q) ||
        o.buyer?.full_name?.toLowerCase().includes(q) ||
        o.items.some((it) => it.product_title.toLowerCase().includes(q)) ||
        o.offer_token.toLowerCase().includes(q),
      );
    }
    return list;
  }, [data, statusFilter, search]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SellerNav sellerName={navData?.seller?.full_name ?? "Seller"} avatarUrl={navData?.seller?.avatar_url ?? null} />

      <main className="flex-1 sd-page sd-page-y">
        <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Lock className="h-3.5 w-3.5 text-primary" />
              <h1 className="sd-page-title animate-fade-in">Private Offers</h1>
            </div>
            <p className="sd-page-sub">Buyer-specific offers you've created. Hidden from public marketplace.</p>
          </div>
          <Button size="sm" onClick={() => navigate("/seller/transactions/new")} className="gap-1.5 h-11 text-xs">
            <Plus className="h-3.5 w-3.5" /> Create Private Offer
          </Button>
        </div>

        {/* Summary Cards */}
        {(data?.offers?.length ?? 0) > 0 && (
          <div className="grid grid-cols-3 gap-2.5 mb-3">
            {(() => {
              const all = data?.offers ?? [];
              const claimed = all.filter((o) => o.status === "claimed" || o.status === "purchased").length;
              const expiredCancelled = all.filter((o) => o.status === "expired" || o.status === "cancelled").length;
              return [
                { label: "Total Private Offers", value: all.length, eyebrow: "" },
                { label: "Claimed Offers", value: claimed, eyebrow: "text-success" },
                { label: "Expired / Cancelled", value: expiredCancelled, eyebrow: "text-muted-foreground" },
              ].map((card, idx) => (
                <Card key={card.label} className={`sd-card sd-metric h-full sd-fade-in-stagger sd-delay-${idx + 1}`}>
                  <CardContent className="p-3">
                    <p className={`sd-eyebrow mb-0.5 ${card.eyebrow}`}>{card.label}</p>
                    <p className="sd-kpi-value tabular-nums">{card.value}</p>
                  </CardContent>
                </Card>
              ));
            })()}
          </div>
        )}

        <Card className="rounded-lg mb-3">
          <CardContent className="p-3 flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by buyer email, item, or token…"
                className="pl-8 h-11 text-xs"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44 h-11 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">{filtered.length} offer{filtered.length !== 1 ? "s" : ""}</span>
          </CardContent>
        </Card>

        {isLoading && (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        )}
        {isError && (
          <Card><CardContent className="p-6 text-destructive">Failed to load offers.</CardContent></Card>
        )}

        {!isLoading && filtered.length === 0 && (
          <Card>
            <CardContent className="p-12 flex flex-col items-center text-center">
              <Lock className="h-10 w-10 text-muted-foreground/40 mb-4" />
              <h2 className="text-lg font-semibold text-foreground mb-1">No private offers yet</h2>
              <p className="text-sm text-muted-foreground max-w-md mb-6">
                Create a private, buyer-specific offer to share a custom deal directly with one buyer. The link is unique and never appears in your public storefront.
              </p>
              <Button onClick={() => navigate("/seller/transactions/new")} className="gap-2">
                <Plus className="h-4 w-4" /> Create Private Offer
              </Button>
            </CardContent>
          </Card>
        )}

        {filtered.length > 0 && (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full min-w-[820px] sd-stack">
                <thead className="bg-muted/40 border-b border-border">
                  <tr className="text-xs uppercase text-muted-foreground">
                    <th className="text-left p-3">Items</th>
                    <th className="text-left p-3">Buyer</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-right p-3">Total</th>
                    <th className="text-left p-3">Expires</th>
                    <th className="text-left p-3">Created</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((o) => (
                    <OfferRow key={o.id} offer={o} />
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </main>

      <Footer />
    </div>
  );
}

function OfferRow({ offer }: { offer: SellerOffer }) {
  const total = offer.items.reduce((s, it) => s + Number(it.unit_price_snapshot) * it.quantity, 0);
  const currency = offer.items[0]?.currency_code ?? "NGN";
  const firstItem = offer.items[0];
  const more = offer.items.length - 1;

  return (
    <tr className="border-b border-border hover:bg-muted/20 transition-colors">
      <td className="p-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-md bg-muted flex-shrink-0 overflow-hidden flex items-center justify-center">
            {firstItem?.primary_media_url
              ? <img src={firstItem.primary_media_url} alt="" className="w-full h-full object-cover" />
              : <Package className="h-4 w-4 text-muted-foreground" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate max-w-[220px]">
              {firstItem?.product_title ?? "—"}
            </p>
            {more > 0 && (
              <p className="text-xs text-muted-foreground">+{more} more item{more > 1 ? "s" : ""}</p>
            )}
            <p className="text-xs text-muted-foreground">{offer.items_count} item{offer.items_count !== 1 ? "s" : ""}</p>
          </div>
        </div>
      </td>
      <td className="p-3 text-sm">
        <p className="text-foreground">{offer.buyer?.full_name ?? <span className="italic text-muted-foreground">Not linked</span>}</p>
        <p className="text-xs text-muted-foreground">{offer.buyer?.email ?? offer.buyer_email ?? "—"}</p>
      </td>
      <td className="p-3">
        <Badge variant="outline" className={statusStyle[offer.status] ?? ""}>
          {offer.status.replace("_", " ")}
        </Badge>
      </td>
      <td className="p-3 text-right text-sm font-medium text-foreground">
        {formatMoney(total, currency)}
      </td>
      <td className="p-3 text-xs text-muted-foreground">
        {offer.expires_at ? new Date(offer.expires_at).toLocaleDateString() : "—"}
      </td>
      <td className="p-3 text-xs text-muted-foreground">
        {new Date(offer.created_at).toLocaleDateString()}
      </td>
      <td className="p-3">
        <Button asChild size="sm" variant="ghost">
          <Link to={`/seller/offers/${offer.id}`}>View</Link>
        </Button>
      </td>
    </tr>
  );
}
