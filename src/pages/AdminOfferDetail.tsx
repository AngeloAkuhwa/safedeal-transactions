import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ArrowLeft, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { adminGetOfferDetail } from "@/services/admin-offers.service";

export default function AdminOfferDetail() {
  const { offerId } = useParams<{ offerId: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-offer-detail", offerId],
    queryFn: () => adminGetOfferDetail(offerId!),
    enabled: !!offerId,
  });

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (isError || !data) return <div className="min-h-screen p-8 text-destructive">Failed to load offer.</div>;

  const { offer, seller, buyer, buyer_verification_level, product, transaction, payment, escrow, events, items } = data;
  const itemList: any[] = items || [];
  const itemsTotal = itemList.reduce((s, it) => s + Number(it.line_total ?? Number(it.unit_price_snapshot) * (it.quantity || 1)), 0);
  const currency = itemList[0]?.currency_code ?? product?.currency_code ?? "NGN";

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/offers"><ArrowLeft className="h-4 w-4 mr-1.5" /> Back to offers</Link>
        </Button>

        <div className="flex items-center gap-3">
          <Lock className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Private Offer</h1>
          <Badge variant="outline">{offer.status}</Badge>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-5 space-y-3">
              <h3 className="font-semibold text-foreground">Offer</h3>
              <Row label="Token" value={<code className="text-xs">{offer.offer_token}</code>} />
              <Row label="Created" value={new Date(offer.created_at).toLocaleString()} />
              <Row label="Linked at" value={offer.linked_at ? new Date(offer.linked_at).toLocaleString() : "—"} />
              <Row label="Claimed at" value={offer.claimed_at ? new Date(offer.claimed_at).toLocaleString() : "—"} />
              <Row label="Purchased at" value={offer.purchased_at ? new Date(offer.purchased_at).toLocaleString() : "—"} />
              <Row label="Expires at" value={offer.expires_at ? new Date(offer.expires_at).toLocaleString() : "—"} />
              <Row label="Cancelled at" value={offer.cancelled_at ? new Date(offer.cancelled_at).toLocaleString() : "—"} />
              {offer.previous_tokens?.length > 0 && (
                <Row label="Previous tokens" value={<span className="text-xs">{offer.previous_tokens.length} reactivation(s)</span>} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-3">
              <h3 className="font-semibold text-foreground">Parties</h3>
              <Row label="Seller" value={`${seller?.full_name} (${seller?.email})`} />
              <Row label="Intended buyer email" value={offer.buyer_email || "—"} />
              <Row label="Linked buyer" value={buyer ? `${buyer.full_name} (${buyer.email})` : "Not linked"} />
              <Row label="Buyer verification" value={buyer_verification_level || "—"} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-3">
              <h3 className="font-semibold text-foreground">Product</h3>
              <Row label="Title" value={product?.title || "—"} />
              <Row label="Price" value={product ? `${product.currency_code} ${Number(product.unit_price).toLocaleString()}` : "—"} />
              <Row label="Status" value={product?.status || "—"} />
              <Row label="Stock" value={product ? `${product.stock_quantity} (${product.reserved_quantity} reserved)` : "—"} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-3">
              <h3 className="font-semibold text-foreground">Transaction & Money</h3>
              <Row label="Transaction code" value={transaction?.transaction_code || "—"} />
              <Row label="Status" value={transaction?.status || "—"} />
              <Row label="Money status" value={transaction?.money_status || "—"} />
              <Row label="Payment" value={payment ? `${payment.status} — ${payment.currency_code} ${Number(payment.amount).toLocaleString()}` : "—"} />
              <Row label="Escrow state" value={escrow?.state || "—"} />
              <Row label="Held in escrow" value={escrow ? `${Number(escrow.held_amount).toLocaleString()}` : "—"} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-foreground">Bundle items ({itemList.length})</h3>
              <p className="text-sm font-bold text-foreground">Snapshot total: {currency} {itemsTotal.toLocaleString()}</p>
            </div>
            {itemList.length === 0 ? (
              <p className="text-sm text-muted-foreground">No items recorded.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-xs uppercase text-muted-foreground border-b border-border">
                    <tr>
                      <th className="text-left p-2">#</th>
                      <th className="text-left p-2">Title (snapshot)</th>
                      <th className="text-right p-2">Qty</th>
                      <th className="text-right p-2">Unit price</th>
                      <th className="text-right p-2">Line total</th>
                      <th className="text-left p-2">Current product</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemList.map((it: any, i: number) => (
                      <tr key={it.id} className="border-b border-border/60">
                        <td className="p-2 text-muted-foreground">{i + 1}</td>
                        <td className="p-2">
                          <p className="text-foreground font-medium">{it.product_title}</p>
                          {it.short_description && <p className="text-xs text-muted-foreground line-clamp-1">{it.short_description}</p>}
                        </td>
                        <td className="p-2 text-right">{it.quantity}</td>
                        <td className="p-2 text-right">{it.currency_code} {Number(it.unit_price_snapshot).toLocaleString()}</td>
                        <td className="p-2 text-right font-medium">{it.currency_code} {Number(it.line_total ?? Number(it.unit_price_snapshot) * it.quantity).toLocaleString()}</td>
                        <td className="p-2">
                          {it.current_product ? (
                            <Badge variant="outline" className="text-xs">{it.current_product.status}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">missing</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold text-foreground mb-3">Audit trail</h3>
            <div className="space-y-2">
              {events.length === 0 && <p className="text-sm text-muted-foreground">No events recorded.</p>}
              {events.map((e: any) => (
                <div key={e.id} className="flex items-start gap-3 text-sm border-l-2 border-primary/30 pl-3 py-1">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</span>
                  <span className="font-medium text-foreground">{e.event_type}</span>
                  {e.metadata && <span className="text-xs text-muted-foreground truncate">{JSON.stringify(e.metadata)}</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground text-right">{value}</span>
    </div>
  );
}
