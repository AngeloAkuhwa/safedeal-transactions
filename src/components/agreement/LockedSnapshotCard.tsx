import { format } from "date-fns";
import { ProductImage } from "@/components/common/ProductImage";
import {
  Lock,
  Fingerprint,
  Box,
  Image as ImageIcon,
  DollarSign,
  Truck,
  ShieldCheck,
} from "lucide-react";
import type { AgreementData } from "@/services/agreement.service";
import { ProductMediaGallery } from "@/components/transactions/ProductMediaGallery";
import { formatMoney } from "@/lib/format";
import { FEE_NAME, FEE_CAPTION } from "@/lib/payment/fee-policy";

interface LockedSnapshotCardProps {
  data: AgreementData;
}

function LockedBadge() {
  return (
    <span className="ml-auto inline-flex items-center px-2 py-1 bg-foreground text-background text-xs font-bold rounded">
      <Lock className="h-3 w-3 mr-1" />
      LOCKED
    </span>
  );
}

export function LockedSnapshotCard({ data }: LockedSnapshotCardProps) {
  const { transaction, item, pricing, delivery, productMedia, bundleItems } = data;
  const media = productMedia ?? [];
  const images = media.filter((m) => (m.mime_type ?? "").startsWith("image/") || m.media_type === "image");
  const videos = media.filter((m) => (m.mime_type ?? "").startsWith("video/") || m.media_type === "video");
  const items = bundleItems ?? [];
  const isBundle = items.length > 1;

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="bg-card rounded-2xl shadow-2xl border-2 border-border overflow-hidden">
        {/* Dark header */}
        <div className="bg-gradient-to-r from-foreground to-foreground/90 px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <Lock className="h-6 w-6 text-warning-foreground" />
              <div>
                <h2 className="text-xl font-bold text-background">Locked Agreement Snapshot</h2>
                <p className="text-background/60 text-sm">Immutable transaction record</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-background/10 backdrop-blur-sm rounded-lg border border-background/20">
              <Fingerprint className="h-4 w-4 text-warning" />
              <span className="text-background font-mono text-sm">
                #{transaction.transaction_code}
              </span>
            </div>
          </div>
        </div>

        <div className="p-6 lg:p-8">
          {/* Top row: Item Details + Product Images */}
          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            {/* Item Details */}
            <div className="bg-muted/50 rounded-xl border-2 border-border p-6">
              <div className="flex items-center gap-2 mb-4">
                <Box className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-bold text-foreground">
                  {isBundle ? `Items (${items.length})` : "Item Details"}
                </h3>
                <LockedBadge />
              </div>
              {isBundle ? (
                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  {items.map((b) => (
                    <div
                      key={b.product_id + b.position}
                      className="flex gap-3 p-3 rounded-lg bg-background border border-border"
                    >
                      {b.primary_media_url ? (
                        <ProductImage
                          url={b.primary_media_url}
                          alt={b.product_title}
                          rendition="thumb"
                          sizes="64px"
                          className="h-16 w-16 flex-shrink-0 rounded"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded bg-muted flex items-center justify-center flex-shrink-0">
                          <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-foreground truncate">
                          {b.product_title}
                        </div>
                        {b.short_description && (
                          <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {b.short_description}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground mt-1">
                          Qty {b.quantity} · {formatMoney(Number(b.unit_price_snapshot), b.currency_code)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : item ? (
                <div className="space-y-4">
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-1">Item Title</div>
                    <div className="text-base font-bold text-foreground">{item.title}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-1">Description</div>
                    <div className="text-sm text-muted-foreground">{item.description}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-1">Quantity</div>
                      <div className="text-base font-bold text-foreground">{item.quantity} Unit{item.quantity > 1 ? "s" : ""}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-1">Condition</div>
                      <div className="text-base font-bold text-success">
                        {item.condition_label?.replace(/_/g, " ") || "N/A"}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No item details available</p>
              )}
            </div>

            {/* Product Media */}
            <div className="bg-muted/50 rounded-xl border-2 border-border p-6">
              <div className="flex items-center gap-2 mb-4">
                <ImageIcon className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-bold text-foreground">Product Media</h3>
                <LockedBadge />
              </div>
              <ProductMediaGallery
                media={media}
                title={item?.title ?? "Product media"}
                variant="compact"
              />
            </div>
          </div>

          {/* Bottom row: Payment + Delivery */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Payment Details */}
            <div className="bg-muted/50 rounded-xl border-2 border-border p-6">
              <div className="flex items-center gap-2 mb-4">
                <DollarSign className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-bold text-foreground">Payment Details</h3>
                <LockedBadge />
              </div>
              {pricing ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-3 border-b border-border">
                    <span className="text-sm text-muted-foreground">Agreed Price</span>
                    <span className="text-xl font-bold text-foreground">
                      {formatMoney(Number(pricing.item_amount), pricing.currency_code)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b border-border">
                    <div>
                      {/* A missing rate is omitted, not rendered as 0.0%: this
                          card is a locked snapshot and must not invent terms. */}
                      <span className="text-sm text-muted-foreground">{FEE_NAME}{typeof pricing.service_fee_rate === "number" ? ` (${(pricing.service_fee_rate * 100).toFixed(1)}%)` : ""}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">{FEE_CAPTION}</p>
                    </div>
                    <span className="text-base font-semibold text-muted-foreground">
                      {formatMoney(Number(pricing.service_fee_amount), pricing.currency_code)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-base font-bold text-foreground">Total Paid</span>
                    <span className="text-2xl font-bold text-primary">
                      {formatMoney(Number(pricing.total_amount), pricing.currency_code)}
                    </span>
                  </div>
                  <div className="mt-4 pt-4 border-t border-border flex items-center gap-2 text-sm">
                    <ShieldCheck className="h-4 w-4 text-success" />
                    <span className="text-muted-foreground">Funds held securely in escrow</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No pricing available</p>
              )}
            </div>

            {/* Delivery Terms */}
            <div className="bg-muted/50 rounded-xl border-2 border-border p-6">
              <div className="flex items-center gap-2 mb-4">
                <Truck className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-bold text-foreground">Delivery Terms</h3>
                <LockedBadge />
              </div>
              {delivery ? (
                <div className="space-y-4">
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-1">Delivery Method</div>
                    <div className="text-base font-bold text-foreground">
                      {delivery.delivery_method?.replace(/_/g, " ") || "N/A"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-1">Expected Delivery Date</div>
                    <div className="text-base font-bold text-foreground">
                      {format(new Date(delivery.expected_delivery_date), "MMMM d, yyyy")}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-1">Verification Window</div>
                    <div className="text-base font-bold text-warning">
                      {delivery.verification_window_hours} hours after delivery
                    </div>
                  </div>
                  {delivery.delivery_address_line1 && (
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-1">Delivery Address</div>
                      <div className="text-sm text-muted-foreground">
                        {delivery.delivery_address_line1}
                        {delivery.delivery_address_line2 && <><br />{delivery.delivery_address_line2}</>}
                        <br />
                        {[delivery.delivery_city, delivery.delivery_state, delivery.delivery_postal_code]
                          .filter(Boolean)
                          .join(", ")}
                        {delivery.delivery_country_code && <><br />{delivery.delivery_country_code}</>}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No delivery terms available</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
