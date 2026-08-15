import { Package, Edit, MoreVertical, Copy, Eye, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { formatMoney } from "@/lib/format";
import { getAvailableQuantity } from "@/lib/inventory";
import {
  resolveProductStatusLabel,
  TONE_CLASSNAMES,
} from "@/lib/status-labels";
import { ProductImage } from "@/components/common/ProductImage";
import { keyActivate } from "@/lib/a11y";

interface SellerProductCardProps {
  product: {
    id: string;
    title: string;
    short_description?: string | null;
    unit_price: number;
    currency_code: string;
    stock_quantity: number;
    reserved_quantity?: number | null;
    status?: string;
    visibility_type?: string;
    primary_image_url?: string | null;
    category_name?: string | null;
    updated_at?: string;
  };
  onClick?: () => void;
  onEdit?: () => void;
  onManageVisibility?: () => void;
  onUpdateStock?: () => void;
  onDuplicate?: () => void;
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

const visibilityConfig: Record<string, { label: string; bg: string; text: string }> = {
  public: { label: "Public", bg: "bg-blue-500/20", text: "text-blue-600 dark:text-blue-400" },
  buyer_specific: { label: "Private", bg: "bg-amber-500/20", text: "text-amber-600 dark:text-amber-400" },
  private_draft: { label: "Draft", bg: "bg-muted", text: "text-muted-foreground" },
};

export function SellerProductCard({ product, onClick, onEdit, onManageVisibility, onUpdateStock, onDuplicate }: SellerProductCardProps) {
  const available = getAvailableQuantity(product);
  const reserved = Number(product.reserved_quantity ?? 0);
  const isOutOfStock = available === 0;
  const isLowStock = available >= 1 && available <= 5;
  const statusEntry = resolveProductStatusLabel(product.status || "draft");
  const statusClass = TONE_CLASSNAMES[statusEntry.tone];
  const visibility = visibilityConfig[product.visibility_type || "public"] || visibilityConfig.public;

  const stockLabel = isOutOfStock ? "Out of Stock" : isLowStock ? "Low Stock" : "In Stock";
  const stockDot = isOutOfStock ? "bg-gray-400" : isLowStock ? "bg-amber-400" : "bg-emerald-400";
  const stockText = isOutOfStock ? "text-gray-500 dark:text-gray-400" : isLowStock ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400";

  return (
    <div role="button" tabIndex={0} onKeyDown={keyActivate}
      className={`group bg-card backdrop-blur-xl border border-border rounded-2xl overflow-hidden transition-all hover:border-primary/30 hover:shadow-lg cursor-pointer ${isOutOfStock ? "opacity-60" : ""}`}
      onClick={onClick}
    >
      {/* Image */}
      <div className="relative h-56 overflow-hidden bg-muted">
        {product.primary_image_url ? (
          <ProductImage
            url={product.primary_image_url}
            alt={product.title}
            rendition="card"
            sizes="(max-width: 640px) 100vw, 360px"
            className="group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="h-12 w-12 text-muted-foreground/30" />
          </div>
        )}
        {/* Badges */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusClass} backdrop-blur-sm`}>
            {statusEntry.label}
          </span>
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${visibility.bg} ${visibility.text} backdrop-blur-sm`}>
            {visibility.label}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-5 space-y-3">
        {product.category_name && (
          <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
            {product.category_name}
          </span>
        )}
        <h3 className="text-lg font-bold text-foreground line-clamp-1">{product.title}</h3>
        {product.short_description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{product.short_description}</p>
        )}

        {/* Price */}
        <div className="pt-3 border-t border-border">
          <p className="text-2xl font-bold text-foreground">
            {formatMoney(product.unit_price, product.currency_code)}
          </p>
        </div>

        {/* Stock */}
        <div role="button" tabIndex={0} onKeyDown={keyActivate}
          className="flex items-center justify-between cursor-pointer hover:bg-muted/50 -mx-2 px-2 py-1 rounded-lg transition-colors min-h-11"
          onClick={(e) => {
            e.stopPropagation();
            onUpdateStock?.();
          }}
          title="Click to update stock"
        >
          <div className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${stockDot}`} />
            <span className={`text-xs font-medium ${stockText}`}>{stockLabel}</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {reserved > 0
              ? `${available} avail · ${reserved} reserved`
              : `Qty: ${product.stock_quantity}`}
          </span>
        </div>

        {/* Last updated */}
        {product.updated_at && (
          <div className="pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Last updated {relativeTime(product.updated_at)}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 gap-1.5 bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.();
            }}
          >
            <Edit className="h-3.5 w-3.5" />
            Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                size="sm"
                variant="outline"
                className="text-muted-foreground hover:text-foreground"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => onEdit?.()}>
                <Edit className="h-3.5 w-3.5 mr-2" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate?.()}>
                <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onManageVisibility?.()}>
                <Eye className="h-3.5 w-3.5 mr-2" /> Manage visibility
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onUpdateStock?.()}>
                <Boxes className="h-3.5 w-3.5 mr-2" /> Update stock
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
