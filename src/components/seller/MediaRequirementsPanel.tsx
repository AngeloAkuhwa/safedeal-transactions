import { AlertTriangle, CheckCircle2, ImageIcon, Video } from "lucide-react";
import type { MediaConfig } from "@/lib/media-rules";

/**
 * Shown ABOVE the file picker so a seller knows the rules before they choose
 * a photo, not after a rejection. All numbers come from config.
 */
export function MediaRequirementsPanel({ config }: { config: MediaConfig }) {
  const mb = (bytes: number) => `${Math.round((bytes / (1024 * 1024)) * 10) / 10}MB`;
  const formats = config.imageAllowedFormats.map((f) => f.toUpperCase()).join(", ");

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <ImageIcon className="h-4 w-4 text-primary" />
        <p className="text-sm font-medium text-foreground">Photo requirements</p>
      </div>
      <ul className="text-xs text-muted-foreground space-y-1">
        <li className="flex gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
          At least {config.imageMinDimensionPx}×{config.imageMinDimensionPx} px
          (aim for {config.imageRecommendedMinPx} px on the longest side)
        </li>
        <li className="flex gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
          Up to {mb(config.imageMaxBytes)} each · {formats}
        </li>
        <li className="flex gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
          {config.productMinImagesToPublish}–{config.productMaxImages} photos to publish
          (drafts save with any number)
        </li>
        <li className="flex gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
          {config.imageAutoNormaliseRatio
            ? `Any shape is fine: we'll pad odd shapes to ${config.imageAllowedRatios[0]} with a white border and show you first`
            : `Shape must be ${config.imageAllowedRatios.join(", ")}`}
        </li>
      </ul>
      <div className="flex items-center gap-2 pt-1">
        <Video className="h-4 w-4 text-primary" />
        <p className="text-xs text-muted-foreground">
          Video: {config.videoAllowedFormats.map((f) => f.toUpperCase()).join("/")} ·
          {" "}{config.videoMinHeightPx}p or better · up to {config.videoMaxSeconds}s · {mb(config.videoMaxBytes)}
        </p>
      </div>
      <p className="text-xs text-muted-foreground flex gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
        For clear photos: use a plain white background, centre the product and fill the frame; avoid text, prices or watermarks.
      </p>
    </div>
  );
}