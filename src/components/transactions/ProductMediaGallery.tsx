import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Maximize2, Play, Image as ImageIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  getCloudinaryDownloadUrl,
  getCloudinaryThumbnail,
  getCloudinaryVideoPoster,
} from "@/lib/cloudinary";
import { productImageSrcSet, productImageUrl } from "@/lib/product-image";

export interface GalleryMediaItem {
  file_url: string | null;
  secure_url: string | null;
  mime_type: string | null;
  media_type?: string | null;
}

interface ProductMediaGalleryProps {
  media: GalleryMediaItem[];
  title: string;
  variant?: "default" | "compact";
}

interface NormalizedItem {
  url: string;
  isVideo: boolean;
  thumb: string;
  poster: string | null;
}

function normalize(items: GalleryMediaItem[]): NormalizedItem[] {
  return items
    .map((m) => {
      const url = m.secure_url || m.file_url || "";
      if (!url) return null;
      const mime = m.mime_type ?? "";
      const isVideo = mime.startsWith("video/") || m.media_type === "video";
      const poster = isVideo ? getCloudinaryVideoPoster(url, 1280, 800) : null;
      const thumb = isVideo
        ? getCloudinaryVideoPoster(url, 128, 128) ?? ""
        : productImageUrl(url, "thumb");
      return { url, isVideo, thumb, poster };
    })
    .filter((x): x is NormalizedItem => x !== null);
}

export function ProductMediaGallery({ media, title, variant = "default" }: ProductMediaGalleryProps) {
  const items = useMemo(() => normalize(media), [media]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const active = items[activeIdx];
  const total = items.length;

  const next = useCallback(() => setActiveIdx((i) => (i + 1) % Math.max(total, 1)), [total]);
  const prev = useCallback(() => setActiveIdx((i) => (i - 1 + Math.max(total, 1)) % Math.max(total, 1)), [total]);

  // Arrow-key nav scoped to the gallery container
  useEffect(() => {
    const el = containerRef.current;
    if (!el || total <= 1) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [next, prev, total]);

  // Reset selection if media list changes
  useEffect(() => {
    if (activeIdx >= items.length) setActiveIdx(0);
  }, [items.length, activeIdx]);

  const heroAspect = variant === "compact" ? "aspect-square" : "aspect-[16/10]";

  // Empty state
  if (total === 0) {
    return (
      <div className={cn("rounded-xl bg-muted flex items-center justify-center", heroAspect)}>
        <ImageIcon className="h-16 w-16 text-muted-foreground/30" />
      </div>
    );
  }

  const downloadUrl = getCloudinaryDownloadUrl(active.url);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="space-y-3 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
      aria-label={`Media gallery for ${title}`}
    >
      {/* Hero */}
      <div className={cn("relative rounded-xl overflow-hidden bg-muted border border-border group", heroAspect)}>
        {active.isVideo ? (
          <video
            key={active.url}
            src={active.url}
            poster={active.poster ?? undefined}
            controls
            preload="metadata"
            className="w-full h-full object-contain bg-background"
          />
        ) : (
          <img
            src={productImageUrl(active.url, "detail") || active.url}
            srcSet={productImageSrcSet(active.url, "zoom") || undefined}
            sizes="(max-width: 768px) 100vw, 640px"
            width={800}
            height={800}
            alt={title}
            className="w-full h-full object-contain"
            loading="lazy"
            decoding="async"
          />
        )}

        {/* Action bar */}
        <div className="absolute top-2 right-2 flex gap-2 opacity-90">
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="h-11 w-11 shadow-md"
            onClick={() => setLightboxOpen(true)}
            aria-label="Open fullscreen"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            asChild
            size="icon"
            variant="secondary"
            className="h-11 w-11 shadow-md"
            aria-label="Download"
          >
            <a href={downloadUrl} download target="_blank" rel="noopener noreferrer">
              <Download className="h-4 w-4" />
            </a>
          </Button>
        </div>

        {/* Prev/next controls when multiple */}
        {total > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="Previous media"
              className="absolute left-2 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-background/80 backdrop-blur border border-border flex items-center justify-center hover:bg-background transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next media"
              className="absolute right-2 bottom-2 h-11 w-11 rounded-full bg-background/80 backdrop-blur border border-border flex items-center justify-center hover:bg-background transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-background/80 backdrop-blur text-xs font-medium text-foreground border border-border">
              {activeIdx + 1} / {total}
            </div>
          </>
        )}
      </div>

      {/* Thumbnails */}
      {total > 1 && (
        <div className="flex gap-2 overflow-x-auto snap-x pb-1 -mx-1 px-1">
          {items.map((m, i) => {
            const isActive = i === activeIdx;
            return (
              <button
                key={m.url + i}
                type="button"
                onClick={() => setActiveIdx(i)}
                className={cn(
                  "relative shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 snap-start transition-all",
                  isActive
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-border hover:border-primary/50",
                )}
                aria-label={`View media ${i + 1}`}
                aria-current={isActive}
              >
                {m.thumb ? (
                  <img
                    src={m.thumb}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      const img = e.currentTarget;
                      if (!m.isVideo && img.src !== m.url) {
                        img.src = m.url;
                      }
                    }}
                  />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center">
                    <ImageIcon className="h-4 w-4 text-muted-foreground/50" />
                  </div>
                )}
                {m.isVideo && (
                  <div className="absolute inset-0 bg-foreground/30 flex items-center justify-center">
                    <Play className="h-5 w-5 text-background fill-background" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Fullscreen lightbox */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-5xl p-2 sm:p-4 bg-background border-border">
          <div className="relative w-full flex items-center justify-center bg-muted rounded-lg overflow-hidden">
            {active.isVideo ? (
              <video
                src={active.url}
                poster={active.poster ?? undefined}
                controls
                autoPlay
                className="w-full max-h-[85dvh] object-contain bg-background"
              />
            ) : (
              <img
                src={active.url}
                alt={title}
                className="w-full max-h-[85dvh] object-contain"
              />
            )}

            {total > 1 && (
              <>
                <button
                  type="button"
                  onClick={prev}
                  aria-label="Previous media"
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-background/80 backdrop-blur border border-border flex items-center justify-center hover:bg-background transition-colors"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={next}
                  aria-label="Next media"
                  className="absolute right-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-background/80 backdrop-blur border border-border flex items-center justify-center hover:bg-background transition-colors"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 px-2 pt-1">
            <span className="text-xs text-muted-foreground">
              {total > 1 ? `${activeIdx + 1} of ${total}` : "1 item"}
            </span>
            <Button asChild size="sm" variant="outline">
              <a href={downloadUrl} download target="_blank" rel="noopener noreferrer">
                <Download className="h-4 w-4 mr-2" />
                Download
              </a>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
