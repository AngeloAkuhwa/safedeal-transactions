import { Package, Edit, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SellerProductCardProps {
  product: {
    id: string;
    title: string;
    short_description?: string | null;
    unit_price: number;
    currency_code: string;
    stock_quantity: number;
    status?: string;
    visibility_type?: string;
    primary_image_url?: string | null;
    category_name?: string | null;
    updated_at?: string;
  };
  onClick?: () => void;
  onEdit?: () => void;
}

function formatPrice(amount: number, currency: string) {
  if (currency === "NGN") return `₦${Number(amount).toLocaleString()}`;
  return `${currency} ${Number(amount).toLocaleString()}`;
}

function relativeTime(dateStr?: string) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  published: { label: "Published", bg: "bg-emerald-500/20", text: "text-emerald-400" },
  draft: { label: "Draft", bg: "bg-amber-500/20", text: "text-amber-400" },
  out_of_stock: { label: "Out of Stock", bg: "bg-gray-500/20", text: "text-gray-400" },
  archived: { label: "Archived", bg: "bg-red-500/20", text: "text-red-400" },
};

const visibilityConfig: Record<string, { label: string; bg: string; text: string }> = {
  public: { label: "Public", bg: "bg-blue-500/20", text: "text-blue-400" },
  buyer_specific: { label: "Buyer Specific", bg: "bg-amber-500/20", text: "text-amber-400" },
  private_draft: { label: "Private", bg: "bg-[#1E2040]/90", text: "text-[#8C8EAA]" },
};

export function SellerProductCard({ product, onClick, onEdit }: SellerProductCardProps) {
  const isOutOfStock = product.stock_quantity === 0;
  const isLowStock = product.stock_quantity >= 1 && product.stock_quantity <= 5;
  const status = statusConfig[product.status || "draft"] || statusConfig.draft;
  const visibility = visibilityConfig[product.visibility_type || "public"] || visibilityConfig.public;

  const stockLabel = isOutOfStock ? "Out of Stock" : isLowStock ? "Low Stock" : "In Stock";
  const stockDot = isOutOfStock ? "bg-gray-400" : isLowStock ? "bg-amber-400" : "bg-emerald-400";
  const stockText = isOutOfStock ? "text-gray-400" : isLowStock ? "text-amber-400" : "text-emerald-400";

  return (
    <div
      className={`group bg-[#1E2040]/60 backdrop-blur-xl border border-[#30344F]/50 rounded-[24px] overflow-hidden transition-all hover:border-[#30344F] hover:shadow-lg hover:shadow-blue-500/5 cursor-pointer ${isOutOfStock ? "opacity-60" : ""}`}
      onClick={onClick}
    >
      {/* Image */}
      <div className="relative h-56 overflow-hidden bg-[#151730]">
        {product.primary_image_url ? (
          <img
            src={product.primary_image_url}
            alt={product.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="h-12 w-12 text-[#30344F]" />
          </div>
        )}
        {/* Badges */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${status.bg} ${status.text} backdrop-blur-sm`}>
            {status.label}
          </span>
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${visibility.bg} ${visibility.text} backdrop-blur-sm`}>
            {visibility.label}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-5 space-y-3">
        {product.category_name && (
          <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
            {product.category_name}
          </span>
        )}
        <h3 className="text-lg font-bold text-white line-clamp-1">{product.title}</h3>
        {product.short_description && (
          <p className="text-sm text-[#8C8EAA] line-clamp-2">{product.short_description}</p>
        )}

        {/* Price */}
        <div className="pt-3 border-t border-[#30344F]">
          <p className="text-2xl font-bold text-white">
            {formatPrice(product.unit_price, product.currency_code)}
          </p>
        </div>

        {/* Stock */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${stockDot}`} />
            <span className={`text-xs font-medium ${stockText}`}>{stockLabel}</span>
          </div>
          <span className="text-xs text-[#8C8EAA]">
            Qty: {product.stock_quantity}
          </span>
        </div>

        {/* Last updated */}
        {product.updated_at && (
          <div className="pt-3 border-t border-[#30344F]">
            <p className="text-xs text-[#8C8EAA]">
              Last updated {relativeTime(product.updated_at)}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 gap-1.5 bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300"
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.();
            }}
          >
            <Edit className="h-3.5 w-3.5" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="bg-[#1E2040]/80 border-[#30344F] text-[#8C8EAA] hover:text-white hover:bg-[#1E2040]"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
