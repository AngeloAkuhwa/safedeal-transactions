import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Camera, Check, Crop as CropIcon, Loader2, Sun, Sparkles, Type, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import {
  cropToSquareFile,
  isBlurry,
  measureSharpness,
  PRODUCT_IMAGE_EXPORT_MAX,
} from "@/lib/image-quality";
import { toast } from "@/components/ui/sonner";

const GUIDANCE_KEY = "safedeal.product-photo-guidance.dismissed";

const GUIDANCE_ITEMS = [
  { icon: CropIcon, label: "Fill the frame" },
  { icon: Sparkles, label: "Plain background" },
  { icon: Sun, label: "Daylight or bright light" },
  { icon: Type, label: "No text or watermarks" },
];

export interface PendingPhoto {
  id: string;
  file: File;
  objectUrl: string;
}

interface Props {
  photo: PendingPhoto | null;
  /** Called with the square-cropped file once the seller confirms. */
  onConfirm: (id: string, file: File) => void;
  onSkip: (id: string) => void;
}

/**
 * 1:1 crop step shown after a seller picks a product photo.
 * Also carries the first-run guidance checklist and the blur advisory.
 */
export function ProductPhotoCropDialog({ photo, onConfirm, onSkip }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);
  const [showGuidance, setShowGuidance] = useState(false);
  const [blurWarning, setBlurWarning] = useState(false);

  useEffect(() => {
    if (!photo) return;
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setArea(null);
    setBlurWarning(false);
    try {
      setShowGuidance(localStorage.getItem(GUIDANCE_KEY) !== "1");
    } catch {
      setShowGuidance(true);
    }
    let cancelled = false;
    measureSharpness(photo.objectUrl).then((score) => {
      if (!cancelled) setBlurWarning(isBlurry(score));
    });
    return () => { cancelled = true; };
  }, [photo]);

  const dismissGuidance = () => {
    setShowGuidance(false);
    try { localStorage.setItem(GUIDANCE_KEY, "1"); } catch { /* private mode */ }
  };

  const onCropComplete = useCallback((_: Area, pixels: Area) => setArea(pixels), []);

  const handleUse = async () => {
    if (!photo || !area) return;
    setProcessing(true);
    try {
      const cropped = await cropToSquareFile(photo.objectUrl, area, photo.file.name, PRODUCT_IMAGE_EXPORT_MAX);
      onConfirm(photo.id, cropped);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not crop this photo.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={!!photo} onOpenChange={(o) => { if (!o && photo) onSkip(photo.id); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Frame your product</DialogTitle>
          <DialogDescription>
            Square photos keep your storefront tidy. Pinch or drag to fill the frame.
          </DialogDescription>
        </DialogHeader>

        {showGuidance && (
          <div className="relative rounded-xl border border-border bg-muted/40 p-3">
            <button
              type="button"
              onClick={dismissGuidance}
              aria-label="Dismiss photo tips"
              className="absolute right-2 top-2 text-muted-foreground hover:text-foreground relative inline-flex items-center justify-center before:absolute before:-inset-3.5 before:content-[''] min-h-11 min-w-11"
            >
              <X className="h-4 w-4" />
            </button>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Camera className="h-3.5 w-3.5 text-primary" /> Photos that sell
            </p>
            <ul className="grid grid-cols-2 gap-1.5">
              {GUIDANCE_ITEMS.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Icon className="h-3.5 w-3.5 text-primary/80 shrink-0" />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="relative h-72 w-full overflow-hidden rounded-xl bg-muted">
          {photo && (
            <Cropper
              image={photo.objectUrl}
              crop={crop}
              zoom={zoom}
              aspect={1}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              restrictPosition
            />
          )}
        </div>

        <div className="flex items-center gap-3 px-1">
          <span className="text-xs text-muted-foreground">Zoom</span>
          <Slider value={[zoom]} min={1} max={3} step={0.05} onValueChange={([v]) => setZoom(v)} />
        </div>

        {blurWarning && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
            This photo looks blurry — retake?
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => photo && onSkip(photo.id)}
            disabled={processing}
          >
            {blurWarning ? "Retake" : "Cancel"}
          </Button>
          <Button onClick={handleUse} disabled={!area || processing}>
            {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            {blurWarning ? "Keep photo" : "Use photo"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
