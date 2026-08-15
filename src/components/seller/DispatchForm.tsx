import { useRef, useCallback } from "react";
import { Loader2, Upload, X, FileVideo, Image as ImageIcon, Barcode, MapPin, Calendar, User, Phone, Link as LinkIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { uploadDispatchEvidence, type UploadedDeliveryFile } from "@/services/delivery.service";
import { toTransactionDeliveryMethod } from "@/lib/delivery-methods";
import type { DeliveryMethod } from "./DeliveryMethodBadge";
import { keyActivate } from "@/lib/a11y";

const COURIERS = ["GIG Logistics", "DHL", "Sendbox", "Kwik", "FedEx", "UPS", "Other"] as const;
const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm";
const MAX_DISPATCH_FILES = 3;

export interface DispatchFormState {
  // courier
  courierName: string;
  courierOther: string;
  trackingNumber: string;
  trackingUrl: string;
  // pickup
  pickupReadyAt: string;
  // meetup
  scheduledHandoffAt: string;
  // hand_delivery
  riderName: string;
  riderPhone: string;
  // shared
  dispatchNote: string;
  dispatchEvidence: UploadedDeliveryFile[];
}

export const emptyDispatchState: DispatchFormState = {
  courierName: "",
  courierOther: "",
  trackingNumber: "",
  trackingUrl: "",
  pickupReadyAt: "",
  scheduledHandoffAt: "",
  riderName: "",
  riderPhone: "",
  dispatchNote: "",
  dispatchEvidence: [],
};

interface DispatchFormProps {
  method: DeliveryMethod | string | null | undefined;
  pickupAddress?: string | null;
  state: DispatchFormState;
  onChange: (next: DispatchFormState) => void;
  uploadingNames: string[];
  uploadProgress: Record<string, number>;
  setUploadingNames: React.Dispatch<React.SetStateAction<string[]>>;
  setUploadProgress: React.Dispatch<React.SetStateAction<Record<string, number>>>;
}

export function DispatchForm({
  method,
  pickupAddress,
  state,
  onChange,
  uploadingNames,
  uploadProgress,
  setUploadingNames,
  setUploadProgress,
}: DispatchFormProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Fail closed: an unknown, missing or listing-vocabulary method must never
  // silently render the courier branch (same rule as `DeliveryMethodBadge`).
  const m = toTransactionDeliveryMethod(method);

  const update = (patch: Partial<DispatchFormState>) => onChange({ ...state, ...patch });

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;
      const remainingSlots = MAX_DISPATCH_FILES - state.dispatchEvidence.length;
      if (remainingSlots <= 0) {
        toast({ title: "Upload limit reached", description: `Maximum ${MAX_DISPATCH_FILES} dispatch files.`, variant: "destructive" });
        return;
      }
      const toUpload = files.slice(0, remainingSlots);
      for (const file of toUpload) {
        const isVideo = file.type.startsWith("video/");
        const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
        if (file.size > maxSize) {
          toast({ title: "File too large", description: `${file.name} exceeds ${isVideo ? "50MB" : "10MB"}.`, variant: "destructive" });
          continue;
        }
        const tempKey = file.name + Date.now();
        setUploadingNames((prev) => [...prev, tempKey]);
        setUploadProgress((prev) => ({ ...prev, [tempKey]: 0 }));
        try {
          const result = await uploadDispatchEvidence(file, (pct) => {
            setUploadProgress((prev) => ({ ...prev, [tempKey]: pct }));
          });
          onChange({ ...state, dispatchEvidence: [...state.dispatchEvidence, result] });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Upload failed";
          toast({ title: "Upload failed", description: msg, variant: "destructive" });
        } finally {
          setUploadingNames((prev) => prev.filter((n) => n !== tempKey));
          setUploadProgress((prev) => {
            const next = { ...prev };
            delete next[tempKey];
            return next;
          });
        }
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [state, onChange, toast, setUploadingNames, setUploadProgress],
  );

  const removeFile = (fileId: string) => {
    onChange({ ...state, dispatchEvidence: state.dispatchEvidence.filter((f) => f.file_id !== fileId) });
  };

  return (
    <div className="space-y-5">
      {m === "courier" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="courier">Courier <span className="text-destructive">*</span></Label>
              <Select value={state.courierName} onValueChange={(v) => update({ courierName: v })}>
                <SelectTrigger id="courier" className="rounded-xl bg-muted">
                  <SelectValue placeholder="Select courier" />
                </SelectTrigger>
                <SelectContent>
                  {COURIERS.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {state.courierName === "Other" && (
                <Input
                  placeholder="Enter courier name"
                  value={state.courierOther}
                  onChange={(e) => update({ courierOther: e.target.value })}
                  className="rounded-xl bg-muted mt-2"
                />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="trackingNumber">Tracking Number <span className="text-destructive">*</span></Label>
              <div className="relative">
                <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="trackingNumber"
                  placeholder="e.g. 1Z999AA10123456784"
                  value={state.trackingNumber}
                  onChange={(e) => update({ trackingNumber: e.target.value })}
                  className="rounded-xl bg-muted pl-10"
                />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="trackingUrl">Tracking URL <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <div className="relative">
              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="trackingUrl"
                type="url"
                placeholder="https://courier.example.com/track/..."
                value={state.trackingUrl}
                onChange={(e) => update({ trackingUrl: e.target.value })}
                className="rounded-xl bg-muted pl-10"
              />
            </div>
          </div>
        </>
      )}

      {m === "pickup" && (
        <>
          {pickupAddress && (
            <div className="bg-muted/50 border rounded-xl p-3 flex items-start gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pickup location</p>
                <p className="text-sm">{pickupAddress}</p>
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="pickupReadyAt">Pickup-ready time <span className="text-destructive">*</span></Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="pickupReadyAt"
                type="datetime-local"
                value={state.pickupReadyAt}
                onChange={(e) => update({ pickupReadyAt: e.target.value })}
                className="rounded-xl bg-muted pl-10"
              />
            </div>
            <p className="text-xs text-muted-foreground">A handoff code will be generated when you submit. Share it with the buyer at pickup.</p>
          </div>
        </>
      )}

      {m === "meetup" && (
        <>
          {pickupAddress && (
            <div className="bg-muted/50 border rounded-xl p-3 flex items-start gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Meetup location</p>
                <p className="text-sm">{pickupAddress}</p>
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="scheduledHandoffAt">Scheduled handoff time <span className="text-destructive">*</span></Label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="scheduledHandoffAt"
                type="datetime-local"
                value={state.scheduledHandoffAt}
                onChange={(e) => update({ scheduledHandoffAt: e.target.value })}
                className="rounded-xl bg-muted pl-10"
              />
            </div>
            <p className="text-xs text-muted-foreground">A handoff code will be generated when you submit. Share it at the meetup.</p>
          </div>
        </>
      )}

      {m === "hand_delivery" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="riderName">Rider / Courier Name <span className="text-destructive">*</span></Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="riderName"
                placeholder="e.g. John Doe"
                value={state.riderName}
                onChange={(e) => update({ riderName: e.target.value })}
                className="rounded-xl bg-muted pl-10"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="riderPhone">Rider Phone <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="riderPhone"
                placeholder="e.g. +234 800 000 0000"
                value={state.riderPhone}
                onChange={(e) => update({ riderPhone: e.target.value })}
                className="rounded-xl bg-muted pl-10"
              />
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="dispatchNote">Dispatch note <span className="text-muted-foreground text-xs">(optional)</span></Label>
        <Textarea
          id="dispatchNote"
          placeholder="Any extra detail the buyer should know..."
          value={state.dispatchNote}
          onChange={(e) => update({ dispatchNote: e.target.value })}
          rows={2}
          className="rounded-xl bg-muted"
          maxLength={500}
        />
      </div>

      {/* Dispatch evidence (optional, for courier & hand_delivery) */}
      {(m === "courier" || m === "hand_delivery") && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              Dispatch evidence <span className="text-muted-foreground text-xs">(optional)</span>
              <span className="text-xs text-muted-foreground font-normal ml-2">
                {state.dispatchEvidence.length}/{MAX_DISPATCH_FILES} files
              </span>
            </h3>
          </div>

          {state.dispatchEvidence.length > 0 && (
            <div className="space-y-2">
              {state.dispatchEvidence.map((f) => (
                <div key={f.file_id} className="flex items-center gap-3 bg-muted/50 border rounded-xl p-3">
                  {f.mime_type.startsWith("video/") ? (
                    <FileVideo className="h-5 w-5 text-purple-500 shrink-0" />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-green-500 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{f.original_name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{f.fingerprint}</p>
                  </div>
                  {f.mime_type.startsWith("image/") && (
                    <img src={f.secure_url} alt={f.original_name} className="h-10 w-10 rounded object-cover" />
                  )}
                  <Button variant="ghost" size="icon" className="shrink-0" onClick={() => removeFile(f.file_id)} aria-label={`Remove ${f.original_name}`}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {uploadingNames.map((key) => (
            <div key={key} className="bg-muted/50 border rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Uploading...</span>
                <span className="text-sm font-medium ml-auto">{uploadProgress[key] ?? 0}%</span>
              </div>
              <Progress value={uploadProgress[key] ?? 0} className="h-2" />
            </div>
          ))}

          {state.dispatchEvidence.length < MAX_DISPATCH_FILES && (
            <div role="button" tabIndex={0} onKeyDown={keyActivate}
              className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES}
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />
              <div className="w-10 h-10 bg-blue-50 dark:bg-blue-950/30 rounded-full flex items-center justify-center mx-auto mb-2">
                <Upload className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-xs font-medium">Upload courier receipt or package photo</p>
              <p className="text-xs text-muted-foreground mt-1">Optional but recommended for dispute protection</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Compute the resolved courier name (handles "Other" → custom text) */
export function resolveCourierName(state: DispatchFormState): string {
  return state.courierName === "Other" ? state.courierOther.trim() : state.courierName;
}
