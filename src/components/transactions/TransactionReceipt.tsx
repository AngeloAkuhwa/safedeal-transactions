import React from "react";
import { format } from "date-fns";
import type { TransactionDetailResponse } from "@/services/transaction-detail.service";

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: currency || "NGN",
    minimumFractionDigits: 2,
  }).format(amount);
}

interface TransactionReceiptProps {
  data: TransactionDetailResponse;
}

export const TransactionReceipt = React.forwardRef<HTMLDivElement, TransactionReceiptProps>(
  ({ data }, ref) => {
    const { transaction: tx, item, pricing, seller, delivery_terms } = data;

    return (
      <>
        {/* Inject print-only styles */}
        <style>{`
          @media print {
            body > *:not(#safedeal-receipt-root) { display: none !important; }
            #safedeal-receipt-root { display: block !important; }
            @page { margin: 20mm; size: A4; }
          }
        `}</style>

        {/* Hidden on screen, visible when printing */}
        <div
          id="safedeal-receipt-root"
          ref={ref}
          className="hidden print:!block"
        >
          <div
            style={{
              fontFamily: "'Segoe UI', Arial, sans-serif",
              maxWidth: "600px",
              margin: "0 auto",
              color: "#111",
              fontSize: "13px",
              lineHeight: "1.6",
            }}
          >
            {/* Header */}
            <div style={{ textAlign: "center", marginBottom: "32px", borderBottom: "2px solid #0f172a", paddingBottom: "20px" }}>
              <div style={{ fontSize: "24px", fontWeight: "900", letterSpacing: "-0.5px", marginBottom: "4px" }}>
                Safe<span style={{ color: "#2563eb" }}>Deal</span>
              </div>
              <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "2px" }}>
                Official Transaction Receipt
              </div>
            </div>

            {/* Transaction Info */}
            <table style={{ width: "100%", marginBottom: "24px", borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <td style={{ color: "#64748b", paddingBottom: "6px", width: "40%" }}>Transaction Code</td>
                  <td style={{ fontWeight: "700", paddingBottom: "6px" }}>{tx.transaction_code}</td>
                </tr>
                <tr>
                  <td style={{ color: "#64748b", paddingBottom: "6px" }}>Date</td>
                  <td style={{ paddingBottom: "6px" }}>{format(new Date(tx.created_at), "MMMM d, yyyy 'at' h:mm a")}</td>
                </tr>
                <tr>
                  <td style={{ color: "#64748b", paddingBottom: "6px" }}>Status</td>
                  <td style={{ paddingBottom: "6px", textTransform: "capitalize" }}>{tx.status.replace(/_/g, " ")}</td>
                </tr>
              </tbody>
            </table>

            <div style={{ borderTop: "1px solid #e2e8f0", marginBottom: "24px" }} />

            {/* Item Details */}
            <div style={{ marginBottom: "24px" }}>
              <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", color: "#64748b", marginBottom: "12px" }}>
                Item Details
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  <tr>
                    <td style={{ color: "#64748b", paddingBottom: "6px", width: "40%" }}>Title</td>
                    <td style={{ fontWeight: "700", paddingBottom: "6px" }}>{item.title}</td>
                  </tr>
                  <tr>
                    <td style={{ color: "#64748b", paddingBottom: "6px" }}>Quantity</td>
                    <td style={{ paddingBottom: "6px" }}>{item.quantity}</td>
                  </tr>
                  {item.condition && (
                    <tr>
                      <td style={{ color: "#64748b", paddingBottom: "6px" }}>Condition</td>
                      <td style={{ paddingBottom: "6px", textTransform: "capitalize" }}>{item.condition}</td>
                    </tr>
                  )}
                  {item.category && (
                    <tr>
                      <td style={{ color: "#64748b", paddingBottom: "6px" }}>Category</td>
                      <td style={{ paddingBottom: "6px" }}>{item.category}</td>
                    </tr>
                  )}
                  {item.brand && (
                    <tr>
                      <td style={{ color: "#64748b", paddingBottom: "6px" }}>Brand</td>
                      <td style={{ paddingBottom: "6px" }}>{item.brand}</td>
                    </tr>
                  )}
                  {item.model && (
                    <tr>
                      <td style={{ color: "#64748b", paddingBottom: "6px" }}>Model</td>
                      <td style={{ paddingBottom: "6px" }}>{item.model}</td>
                    </tr>
                  )}
                  {item.description && (
                    <tr>
                      <td style={{ color: "#64748b", paddingBottom: "6px", verticalAlign: "top" }}>Description</td>
                      <td style={{ paddingBottom: "6px" }}>{item.description}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ borderTop: "1px solid #e2e8f0", marginBottom: "24px" }} />

            {/* Pricing */}
            <div style={{ marginBottom: "24px" }}>
              <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", color: "#64748b", marginBottom: "12px" }}>
                Payment Breakdown
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  <tr>
                    <td style={{ color: "#64748b", paddingBottom: "6px" }}>Item Price</td>
                    <td style={{ textAlign: "right", paddingBottom: "6px" }}>{formatCurrency(pricing.item_amount, pricing.currency_code)}</td>
                  </tr>
                  {pricing.platform_fee_amount > 0 && (
                    <tr>
                      <td style={{ color: "#64748b", paddingBottom: "6px" }}>Platform Fee</td>
                      <td style={{ textAlign: "right", paddingBottom: "6px" }}>{formatCurrency(pricing.platform_fee_amount, pricing.currency_code)}</td>
                    </tr>
                  )}
                  {pricing.processing_fee_amount > 0 && (
                    <tr>
                      <td style={{ color: "#64748b", paddingBottom: "6px", borderBottom: "1px solid #e2e8f0" }}>Processing Fee</td>
                      <td style={{ textAlign: "right", paddingBottom: "6px", borderBottom: "1px solid #e2e8f0" }}>{formatCurrency(pricing.processing_fee_amount, pricing.currency_code)}</td>
                    </tr>
                  )}
                  <tr>
                    <td style={{ fontWeight: "800", paddingTop: "8px", fontSize: "14px" }}>Total Paid</td>
                    <td style={{ textAlign: "right", fontWeight: "800", paddingTop: "8px", fontSize: "14px", color: "#2563eb" }}>{formatCurrency(pricing.buyer_total_amount, pricing.currency_code)}</td>
                  </tr>
                  <tr>
                    <td style={{ color: "#94a3b8", fontSize: "11px" }}>Currency</td>
                    <td style={{ textAlign: "right", color: "#94a3b8", fontSize: "11px" }}>{pricing.currency_code}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Seller + Delivery */}
            {(seller || delivery_terms?.delivery_address_line1) && (
              <>
                <div style={{ borderTop: "1px solid #e2e8f0", marginBottom: "24px" }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "24px" }}>
                  {seller && (
                    <div>
                      <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", color: "#64748b", marginBottom: "8px" }}>Seller</div>
                      <div style={{ fontWeight: "700" }}>{seller.full_name}</div>
                      <div style={{ color: "#64748b", fontSize: "12px" }}>Member since {format(new Date(seller.member_since), "MMMM yyyy")}</div>
                    </div>
                  )}
                  {delivery_terms?.delivery_address_line1 && (
                    <div>
                      <div style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", color: "#64748b", marginBottom: "8px" }}>Delivery Address</div>
                      <div style={{ fontWeight: "600" }}>{delivery_terms.delivery_address_line1}</div>
                      {delivery_terms.delivery_address_line2 && <div>{delivery_terms.delivery_address_line2}</div>}
                      <div style={{ color: "#64748b", fontSize: "12px" }}>
                        {[delivery_terms.delivery_city, delivery_terms.delivery_state, delivery_terms.delivery_postal_code].filter(Boolean).join(", ")}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Footer */}
            <div style={{ borderTop: "2px solid #0f172a", paddingTop: "16px", textAlign: "center", color: "#64748b", fontSize: "11px" }}>
              <div style={{ fontWeight: "700", color: "#111", marginBottom: "4px" }}>Protected by SafeDeal Escrow</div>
              <div>This is an official receipt generated by SafeDeal. Keep it for your records.</div>
              <div style={{ marginTop: "4px" }}>Generated on {format(new Date(), "MMMM d, yyyy 'at' h:mm a")}</div>
            </div>
          </div>
        </div>
      </>
    );
  }
);

TransactionReceipt.displayName = "TransactionReceipt";
