import { useState, useRef } from "react";
import { Send, Loader2, Upload, X, FileVideo } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { submitSellerResponse } from "@/services/seller-dispute-detail.service";
import { supabase } from "@/integrations/supabase/client";
import { getCloudinaryThumbnail } from "@/lib/cloudinary";

interface SellerResponseFormProps {
  disputeId: string;
  onSuccess: () => void;
  responseNumber?: number;
  isFollowUp?: boolean;
}

interface UploadedFile {
  fileId: string;
  previewUrl: string;
  fileName: string;
  mimeType: string;
  uploading: boolean;
}

const MAX_FILES = 3;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "video/webm"];

async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function SellerResponseForm({
  disputeId,
  onSuccess,
  responseNumber = 1,
  isFollowUp = false,
}: SellerResponseFormProps) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (files.length + selectedFiles.length > MAX_FILES) {
      toast.error(`Maximum ${MAX_FILES} evidence files allowed.`);
      return;
    }

    for (const file of selectedFiles) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(`${file.name}: Unsupported format. Use JPEG, PNG, WEBP, MP4, MOV, or WEBM.`);
        continue;
      }

      const isVideo = file.type.startsWith("video/");
      const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
      if (file.size > maxSize) {
        toast.error(`${file.name}: File exceeds ${isVideo ? "50MB" : "10MB"} limit.`);
        continue;
      }

      await uploadFile(file);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    const tempId = `temp-${Date.now()}-${Math.random()}`;

    setFiles((prev) => [
      ...prev,
      { fileId: tempId, previewUrl: "", fileName: file.name, mimeType: file.type, uploading: true },
    ]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { data: signData, error: signErr } = await supabase.functions.invoke("upload-evidence", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { action: "sign_upload", context: "dispute_evidence" },
      });
      if (signErr || !signData) throw new Error("Failed to get upload signature");

      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", signData.api_key);
      formData.append("timestamp", String(signData.timestamp));
      formData.append("signature", signData.signature);
      formData.append("folder", signData.folder);

      const isVideo = file.type.startsWith("video/");
      const resourceType = isVideo ? "video" : "image";
      const uploadUrl = `https://api.cloudinary.com/v1_1/${signData.cloud_name}/${resourceType}/upload`;

      const uploadRes = await fetch(uploadUrl, { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("Cloudinary upload failed");

      const cloudinaryData = await uploadRes.json();
      const fileHash = await computeFileHash(file);
      const format = cloudinaryData.format || file.name.split(".").pop()?.toLowerCase() || "jpg";

      const { data: regData, error: regErr } = await supabase.functions.invoke("upload-evidence", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          action: "register_file",
          public_id: cloudinaryData.public_id,
          asset_id: cloudinaryData.asset_id,
          secure_url: cloudinaryData.secure_url,
          bytes: cloudinaryData.bytes,
          format,
          resource_type: resourceType,
          original_filename: file.name,
          file_hash: fileHash,
          hash_algorithm: "sha256",
          context_type: "dispute_evidence",
        },
      });

      if (regErr || !regData?.file_id) throw new Error("Failed to register file");

      setFiles((prev) =>
        prev.map((f) =>
          f.fileId === tempId
            ? {
                fileId: regData.file_id,
                previewUrl: regData.secure_url || cloudinaryData.secure_url,
                fileName: file.name,
                mimeType: file.type,
                uploading: false,
              }
            : f
        )
      );
    } catch (err) {
      console.error("Upload error:", err);
      toast.error(`Failed to upload ${file.name}`);
      setFiles((prev) => prev.filter((f) => f.fileId !== tempId));
    } finally {
      setUploading(false);
    }
  };

  const removeFile = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.fileId !== fileId));
  };

  const handleSubmit = async () => {
    if (text.trim().length < 10) {
      toast.error("Your response must be at least 10 characters.");
      return;
    }

    const anyUploading = files.some((f) => f.uploading);
    if (anyUploading) {
      toast.error("Please wait for file uploads to complete.");
      return;
    }

    setSubmitting(true);
    try {
      const evidenceIds = files
        .filter((f) => !f.uploading && !f.fileId.startsWith("temp-"))
        .map((f) => f.fileId);

      await submitSellerResponse(disputeId, text.trim(), evidenceIds);
      toast.success(
        isFollowUp
          ? "Follow-up response submitted successfully."
          : "Response submitted successfully."
      );
      onSuccess();
    } catch (err) {
      toast.error((err as Error).message || "Failed to submit response.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border-primary/20" id={isFollowUp ? "respond-followup" : "respond"}>
      <CardHeader className="bg-primary/5 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <Send className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">
              {isFollowUp ? "Submit Follow-up Response" : "Submit Your Response"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {isFollowUp
                ? `Response ${responseNumber} of 2. Add additional details to strengthen your case.`
                : "Explain your side clearly. Attach up to 3 evidence files."}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        <Textarea
          placeholder={
            isFollowUp
              ? "Add additional details or clarifications to your case..."
              : "Describe your response to the buyer's claim. Include any relevant details about the item, delivery, or communication..."
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          maxLength={5000}
          className="resize-none"
        />

        {files.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {files.map((file) => (
              <div
                key={file.fileId}
                className="relative w-20 h-20 rounded-lg border border-border overflow-hidden bg-muted group"
              >
                {file.uploading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : file.mimeType.startsWith("video/") ? (
                  <div className="flex flex-col items-center justify-center h-full">
                    <FileVideo className="h-6 w-6 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground mt-1 truncate max-w-[70px] px-1">
                      {file.fileName}
                    </span>
                  </div>
                ) : (
                  <img
                    src={getCloudinaryThumbnail(file.previewUrl, 160, 160)}
                    alt={file.fileName}
                    className="w-full h-full object-cover"
                  />
                )}
                {!file.uploading && (
                  <button
                    onClick={() => removeFile(file.fileId)}
                    aria-label={`Remove ${file.fileName}`}
                    className="absolute right-0.5 top-0.5 flex h-11 w-11 items-center justify-center rounded-full bg-background/90 shadow-sm"
                  >
                    <X className="h-3 w-3 text-foreground" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground">
              {text.length}/5000 characters
            </p>
            {files.length < MAX_FILES && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-11 gap-1"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Add Evidence ({files.length}/{MAX_FILES})
                </Button>
              </>
            )}
          </div>
          <Button
            onClick={handleSubmit}
            disabled={submitting || text.trim().length < 10 || files.some((f) => f.uploading)}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {isFollowUp ? "Submit Follow-up" : "Submit Response"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
