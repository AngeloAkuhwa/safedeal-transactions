import { cn } from "@/lib/utils";
import { productImageProps, type ProductRendition } from "@/lib/product-image";

interface ProductImageProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet" | "sizes" | "width" | "height"> {
  url: string | null | undefined;
  alt: string;
  /** Largest rendition this slot ever needs. */
  rendition?: ProductRendition;
  sizes?: string;
}

/**
 * Renders a product photo through the SafeDeal Image Standard renditions
 * (square, enhanced, f_auto/q_auto) with srcset + explicit intrinsic size so
 * the layout never shifts while the photo loads.
 */
export function ProductImage({
  url,
  alt,
  rendition = "card",
  sizes,
  className,
  loading = "lazy",
  ...rest
}: ProductImageProps) {
  const props = productImageProps(url, rendition, sizes);
  if (!props.src) return null;
  return (
    <img
      {...props}
      alt={alt}
      loading={loading}
      decoding="async"
      className={cn("h-full w-full object-cover", className)}
      {...rest}
    />
  );
}
