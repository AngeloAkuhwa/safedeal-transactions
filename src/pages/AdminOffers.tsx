import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Loader2, Search, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { adminListOffers, type AdminOfferListItem } from "@/services/admin-offers.service";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "pending_claim", label: "Pending claim" },
  { value: "linked", label: "Linked" },
  { value: "claimed", label: "Claimed" },
  { value: "purchased", label: "Purchased" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
];

export default function AdminOffers() {
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-offers", status, page],
    queryFn: () => adminListOffers(status, page),
  });

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <Lock className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Private Offers — Admin Oversight</h1>
        </div>
        <p className="text-muted-foreground mb-6">All buyer-specific offers across the platform.</p>

        <Card className="mb-4">
          <CardContent className="p-4 flex flex-wrap gap-3 items-center">
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">{data?.total ?? 0} total</span>
          </CardContent>
        </Card>

        {isLoading && <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}
        {isError && <Card><CardContent className="p-6 text-destructive">Failed to load offers.</CardContent></Card>}

        {data && (
          <Card>
            <CardContent className="p-0">
              <table className="w-full">
                <thead className="bg-muted/40 border-b border-border">
                  <tr className="text-xs uppercase text-muted-foreground">
                    <th className="text-left p-3">Product</th>
                    <th className="text-center p-3">Items</th>
                    <th className="text-left p-3">Seller</th>
                    <th className="text-left p-3">Buyer / Email</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">Created</th>
                    <th className="text-left p-3">Expires</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.offers.map((o: AdminOfferListItem) => (
                    <tr key={o.id} className="border-b border-border hover:bg-muted/20">
                      <td className="p-3">
                        <div className="font-medium text-foreground text-sm">{o.product?.title || "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {o.product?.currency_code} {Number(o.product?.unit_price || 0).toLocaleString()}
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        <span className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                          {(o as any).items_count ?? 1}
                        </span>
                      </td>
                      <td className="p-3 text-sm">
                        <div className="text-foreground">{o.seller?.full_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{o.seller?.email}</div>
                      </td>
                      <td className="p-3 text-sm">
                        <div className="text-foreground">{o.buyer?.full_name || <span className="italic text-muted-foreground">Not linked</span>}</div>
                        <div className="text-xs text-muted-foreground">{o.buyer?.email || o.buyer_email}</div>
                      </td>
                      <td className="p-3"><Badge variant="outline">{o.status}</Badge></td>
                      <td className="p-3 text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</td>
                      <td className="p-3 text-xs text-muted-foreground">{o.expires_at ? new Date(o.expires_at).toLocaleDateString() : "—"}</td>
                      <td className="p-3">
                        <Button asChild size="sm" variant="ghost">
                          <Link to={`/admin/offers/${o.id}`}>View</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {data.offers.length === 0 && (
                    <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No offers match these filters.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {data && data.total > data.page_size && (
          <div className="flex justify-center gap-2 mt-4">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <span className="px-3 py-1.5 text-sm text-muted-foreground">Page {page}</span>
            <Button variant="outline" size="sm" disabled={page * data.page_size >= data.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        )}
      </div>
    </div>
  );
}
