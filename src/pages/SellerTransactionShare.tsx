import { useParams, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SellerNav } from "@/components/seller/SellerNav";
import { Footer } from "@/components/landing/Footer";
import { TransactionSuccess } from "@/components/seller/TransactionSuccess";
import { getSellerTransactionDetail } from "@/services/seller-transaction-detail.service";
import { getSellerDashboard } from "@/services/seller-dashboard.service";
import { resolveDeliveryMethod, resolveItemCondition } from "@/lib/status-labels";

const SellerTransactionShare = () => {
  const { transactionId } = useParams<{ transactionId: string }>();
  const navigate = useNavigate();

  const { data: navData } = useQuery({
    queryKey: ["seller-dashboard"],
    queryFn: getSellerDashboard,
    staleTime: 60_000,
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["seller-transaction-detail", transactionId],
    queryFn: () => getSellerTransactionDetail(transactionId!),
    enabled: !!transactionId,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background gap-4 px-4 text-center">
        <RefreshCw className="h-7 w-7 text-destructive" />
        <h2 className="text-xl font-bold text-foreground">Could not load transaction</h2>
        <p className="text-muted-foreground text-sm">{(error as Error)?.message}</p>
        <div className="flex gap-3">
          <Button onClick={() => refetch()}>Try Again</Button>
          <Button variant="outline" onClick={() => navigate("/seller/transactions")}>Back</Button>
        </div>
      </div>
    );
  }

  const { transaction: tx, buyer, item, pricing } = data;
  const currency = pricing?.currency_code ?? "NGN";
  const currSymbol = currency === "NGN" ? "₦" : currency === "USD" ? "$" : `${currency} `;

  // Map API data to TransactionSuccess props
  const form = {
    buyer_name: buyer.name,
    buyer_contact: buyer.email || buyer.phone,
    item_title: item?.title ?? "Untitled",
    item_description: item?.description ?? "",
    item_quantity: item?.quantity ?? 1,
    item_condition: item?.condition ?? "",
    price: pricing?.item_amount ?? 0,
    currency_code: currency,
    delivery_method: tx.delivery_method,
    expected_delivery_date: tx.expected_delivery_date ?? "",
    verification_window_hours: tx.verification_window_hours,
  };

  const pricingProps = pricing
    ? {
        service_fee_amount: pricing.service_fee_amount,
        seller_net_amount: pricing.seller_net_amount,
        total_amount: pricing.buyer_total_amount,
        is_capped: Boolean(
          (pricing as { is_total_service_fee_capped?: boolean }).is_total_service_fee_capped,
        ),
      }
    : null;

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <SellerNav
        sellerName={navData?.seller.full_name ?? "Seller"}
        avatarUrl={navData?.seller.avatar_url ?? null}
      />
      <TransactionSuccess
        publishedUrl={tx.share_url ?? ""}
        transactionCode={tx.transaction_code}
        form={form}
        pricing={pricingProps}
        currSymbol={currSymbol}
        deliveryLabel={resolveDeliveryMethod(tx.delivery_method)}
        conditionLabel={resolveItemCondition(item?.condition)}
      />
      <Footer />
    </div>
  );
};

export default SellerTransactionShare;
