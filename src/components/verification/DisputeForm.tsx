import { useState, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  AlertTriangle, Loader2, Flag, X, CloudUpload, Plus,
  FileText, Film, ImageIcon, RotateCcw, Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { raiseDispute, uploadEvidence } from "@/services/verification.service";

const REASONS = [
  { value: "wrong_item_received", label: "Wrong item received" },
  { value: "damaged_item_received", label: "Damaged item received" },
  { value: "incomplete_order", label: "Incomplete order" },
  { value: "item_not_as_described", label: "Item not as described" },
  { value: "item_not_delivered", label: "Item not delivered" },
  { value: "suspected_fake_item", label: "Suspected fake item" },
  { value: "other", label: "Other" },
] as const;

const MAX_FILES = 10;
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_DURATION = 60; // seconds
const ACCEPTED_TYPES = "image/jpeg,image/png,video/mp4,application/pdf";

interface UploadedFile {
  id: string;
  url: string;
  name: string;
  mime: string;
  status: "uploading" | "done" | "error";
  fingerprint: string;
  progress?: number;
  error?: string;
  localPreview?: string;
  file?: File;
}

interface DisputeFormProps {
  transactionId: string;
  onCancel: () => void;
}

function validateVideoDuration(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration <= MAX_VIDEO_DURATION);
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      resolve(false);
    };
    video.src = URL.createObjectURL(file);
  });
}

export function DisputeForm({ transactionId, onCancel }: DisputeFormProps) {
  const navigate = useNavigate();
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const allUploadsComplete = uploadedFiles.every((f) => f.status !== "uploading");
  const hasErrors = uploadedFiles.some((f) => f.status === "error");

  const mutation = useMutation({
    mutationFn: () => {
      const fileIds = uploadedFiles.filter((f) => f.status === "done").map((f) => f.id);
      return raiseDispute(transactionId, reason, description, fileIds.length > 0 ? fileIds : undefined);
    },
    onSuccess: (data) => {
      toast.success("Dispute submitted. Funds are now frozen.");
      navigate(data.redirect || "/dashboard/disputes");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to submit dispute");
    },
  });

  const canSubmit =
    reason &&
    description.trim().length >= 20 &&
    !mutation.isPending &&
    allUploadsComplete &&
    !hasErrors;

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const remaining = MAX_FILES - uploadedFiles.length;

    if (remaining <= 0) {
      toast.error(`Maximum ${MAX_FILES} files allowed`);
      return;
    }

    const toProcess = fileArray.slice(0, remaining);
    if (fileArray.length > remaining) {
      toast.warning(`Only ${remaining} more file(s) can be added`);
    }

    for (const file of toProcess) {
      // Client-side validation
      if (file.size > MAX_SIZE) {
        toast.error(`${file.name} exceeds 10MB limit`);
        continue;
      }

      if (!["image/jpeg", "image/png", "video/mp4", "application/pdf"].includes(file.type)) {
        toast.error(`${file.name}: unsupported format`);
        continue;
      }

      if (file.type === "video/mp4") {
        const validDuration = await validateVideoDuration(file);
        if (!validDuration) {
          toast.error(`${file.name}: video must be 60 seconds or less`);
          continue;
        }
      }

      const tempId = crypto.randomUUID();
      const localPreview = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;

      const placeholder: UploadedFile = {
        id: tempId,
        url: "",
        name: file.name,
        mime: file.type,
        status: "uploading",
        fingerprint: "",
        localPreview,
        file,
      };

      setUploadedFiles((prev) => [...prev, placeholder]);

      // Upload in background
      uploadEvidence(file, (pct) => {
        setUploadedFiles((prev) =>
          prev.map((f) => (f.id === tempId ? { ...f, progress: pct } : f)),
        );
      })
        .then((result) => {
          setUploadedFiles((prev) =>
            prev.map((f) =>
              f.id === tempId
                ? {
                    ...f,
                    id: result.file_id,
                    url: result.secure_url,
                    mime: result.mime_type,
                    name: result.original_file_name || file.name,
                    status: "done" as const,
                    fingerprint: result.fingerprint,
                    file: undefined,
                  }
                : f,
            ),
          );
        })
        .catch((err) => {
          setUploadedFiles((prev) =>
            prev.map((f) =>
              f.id === tempId
                ? { ...f, status: "error" as const, error: err.message }
                : f,
            ),
          );
        });
    }
  }, [uploadedFiles.length]);

  const removeFile = (id: string) => {
    setUploadedFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file?.localPreview) URL.revokeObjectURL(file.localPreview);
      return prev.filter((f) => f.id !== id);
    });
  };

  const retryFile = async (id: string) => {
    const fileEntry = uploadedFiles.find((f) => f.id === id);
    if (!fileEntry?.file) {
      toast.error("Original file no longer available. Please re-select it.");
      removeFile(id);
      return;
    }

    setUploadedFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, status: "uploading" as const, error: undefined, progress: 0 } : f)),
    );

    try {
      const result = await uploadEvidence(fileEntry.file, (pct) => {
        setUploadedFiles((prev) =>
          prev.map((f) => (f.id === id ? { ...f, progress: pct } : f)),
        );
      });
      setUploadedFiles((prev) =>
        prev.map((f) =>
          f.id === id
            ? {
                ...f,
                id: result.file_id,
                url: result.secure_url,
                mime: result.mime_type,
                name: result.original_file_name || fileEntry.name,
                status: "done" as const,
                fingerprint: result.fingerprint,
                file: undefined,
              }
            : f,
        ),
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setUploadedFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, status: "error" as const, error: message } : f)),
      );
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) {
      processFiles(e.dataTransfer.files);
    }
  };

  const getFileIcon = (mime: string) => {
    if (mime.startsWith("image/")) return <ImageIcon className="h-5 w-5 text-primary" />;
    if (mime.startsWith("video/")) return <Film className="h-5 w-5 text-accent-foreground" />;
    return <FileText className="h-5 w-5 text-muted-foreground" />;
  };

  return (
    <div className="bg-card rounded-2xl shadow-lg border-2 border-destructive/30 p-5 lg:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Flag className="h-5 w-5 text-destructive" />
          <h2 className="text-lg font-bold text-foreground">Submit a Dispute</h2>
        </div>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
          <X className="h-6 w-6" />
        </button>
      </div>

      <div className="space-y-6">
        {/* Reason */}
        <div className="space-y-2">
          <Label htmlFor="dispute-reason" className="text-sm font-semibold">
            Reason for Dispute
          </Label>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger id="dispute-reason" className="rounded-xl">
              <SelectValue placeholder="Select a reason…" />
            </SelectTrigger>
            <SelectContent>
              {REASONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="dispute-description" className="text-sm font-semibold">
            Describe the Issue{" "}
            <span className="text-muted-foreground font-normal">(min 20 characters)</span>
          </Label>
          <Textarea
            id="dispute-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Explain in detail what is wrong with the item you received…"
            rows={4}
            className="rounded-xl"
          />
          <p className="text-xs text-muted-foreground text-right">
            {description.length} / 20 min
          </p>
        </div>

        {/* Upload zone */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold">
            Upload Evidence{" "}
            <span className="text-muted-foreground font-normal">
              ({uploadedFiles.length}/{MAX_FILES})
            </span>
          </Label>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_TYPES}
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                processFiles(e.target.files);
                e.target.value = "";
              }
            }}
          />

          {uploadedFiles.length < MAX_FILES && (
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                isDragging
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary hover:bg-primary/5"
              }`}
            >
              <CloudUpload className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-semibold text-foreground mb-1">
                Click to upload photos or videos
              </p>
              <p className="text-xs text-muted-foreground mb-4">or drag and drop files here</p>
              <p className="text-xs text-muted-foreground/60">
                PNG, JPG, MP4, PDF up to 10MB each · Videos max 60s
              </p>
            </div>
          )}

          {/* File preview grid */}
          {uploadedFiles.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {uploadedFiles.map((f) => (
                <div
                  key={f.id}
                  className={`relative rounded-lg border-2 overflow-hidden group ${
                    f.status === "error"
                      ? "border-destructive/50 bg-destructive/5"
                      : f.status === "uploading"
                        ? "border-primary/30 bg-primary/5"
                        : "border-border bg-muted/30"
                  }`}
                >
                  {/* Preview area */}
                  <div className="aspect-square flex items-center justify-center bg-muted/20 relative">
                    {f.localPreview && f.mime.startsWith("image/") ? (
                      <img
                        src={f.localPreview}
                        alt={f.name}
                        className="w-full h-full object-cover"
                      />
                    ) : f.url && f.mime.startsWith("image/") ? (
                      <img
                        src={f.url}
                        alt={f.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        {getFileIcon(f.mime)}
                        <span className="text-[10px] text-muted-foreground uppercase font-medium">
                          {f.mime.split("/")[1]?.toUpperCase() || "FILE"}
                        </span>
                      </div>
                    )}

                    {/* Loading overlay with progress */}
                    {f.status === "uploading" && (
                      <div className="absolute inset-0 bg-background/70 flex flex-col items-center justify-center gap-2 px-3">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        <Progress value={f.progress ?? 0} className="h-1.5 w-full" />
                        <span className="text-xs font-semibold text-primary">
                          {f.progress ?? 0}%
                        </span>
                      </div>
                    )}

                    {/* Error overlay */}
                    {f.status === "error" && (
                      <div className="absolute inset-0 bg-background/60 flex flex-col items-center justify-center gap-1 p-2">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                        <p className="text-[10px] text-destructive text-center leading-tight">
                          {f.error || "Failed"}
                        </p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            retryFile(f.id);
                          }}
                           className="mt-1 flex min-h-11 items-center gap-1 px-2 text-xs text-primary hover:underline"
                        >
                          <RotateCcw className="h-3 w-3" /> Retry
                        </button>
                      </div>
                    )}

                    {/* Remove button */}
                    <button
                      onClick={() => removeFile(f.id)}
                      aria-label={`Remove ${f.name}`}
                      className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full bg-background/90 shadow-sm hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* File info */}
                  <div className="p-1.5">
                    <p className="text-[10px] text-foreground truncate font-medium">{f.name}</p>
                    {f.fingerprint && (
                      <div className="flex items-center gap-0.5 mt-0.5">
                        <Hash className="h-2.5 w-2.5 text-muted-foreground" />
                        <span className="text-[9px] text-muted-foreground font-mono">
                          {f.fingerprint}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Add more button */}
              {uploadedFiles.length < MAX_FILES && (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
                  className="aspect-square bg-muted/50 rounded-lg border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-all"
                >
                  <Plus className="h-6 w-6 text-muted-foreground/40" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Review warning */}
        <div className="bg-warning/5 border border-warning/20 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">Review Before Submitting</p>
              <p className="text-xs text-muted-foreground">
                Make sure all information is accurate and you've uploaded clear evidence. Once
                submitted, you cannot edit your dispute.
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={!canSubmit}
            className="flex-1 font-bold py-4 rounded-xl shadow-lg"
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit Dispute
          </Button>
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={mutation.isPending}
            className="flex-1 font-semibold py-4 rounded-xl border-2"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
