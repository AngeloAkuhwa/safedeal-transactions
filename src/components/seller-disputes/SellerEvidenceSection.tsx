import { useState, useRef } from "react";
import {
  Image,
  FileVideo,
  FileText,
  ExternalLink,
  Upload,
  Loader2,
  Info,
  Package,
  Shield,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";
import { getCloudinaryThumbnail } from "@/lib/cloudinary";
import { supabase } from "@/integrations/supabase/client";
import { submitAdditionalEvidence, replaceAdditionalEvidence } from "@/services/seller-dispute-detail.service";
import type { SellerDisputeEvidence, SellerDisputeProofFile, SellerDisputePermissions } from "@/services/seller-dispute-detail.service";

interface SellerEvidenceSectionProps {
  disputeId: string;
  disputeStatus: string;
  sellerEvidence: SellerDisputeEvidence[];
  deliveryProofFiles: SellerDisputeProofFile[];
  additionalEvidenceSubmitted: boolean;
  disputeOpenedAt: string;
  permissions: SellerDisputePermissions;
  onRefetch: () => void;
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "video/webm"];

async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function FileTypeIcon({ mimeType }: { mimeType: string | null }) {
  if (mimeType?.startsWith("video/")) return <FileVideo className="h-4 w-4 text-muted-foreground" />;
  if (mimeType?.startsWith("image/")) return <Image className="h-4 w-4 text-muted-foreground" />;
  return <FileText className="h-4 w-4 text-muted-foreground" />;
}

function EvidenceFileCard({
  fileUrl,
  mimeType,
  fileName,
  createdAt,
  tag,
  tagColor,
  onReplace,
  replacing,
}: {
  fileUrl: string | null;
  mimeType: string | null;
  fileName: string | null;
  createdAt: string;
  tag: string;
  tagColor: string;
  onReplace?: () => void;
  replacing?: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const isImage = fileUrl && mimeType?.startsWith("image/") && !imgError;

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card relative">
      {isImage ? (
        <img
          src={getCloudinaryThumbnail(fileUrl, 300, 200)}
          alt={fileName ?? "Evidence"}
          className="w-full h-28 object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="w-full h-28 flex flex-col items-center justify-center text-xs text-muted-foreground p-2 bg-muted">
          <FileTypeIcon mimeType={mimeType} />
          <span className="truncate max-w-full mt-1">{fileName ?? "File"}</span>
        </div>
      )}
      {fileUrl && (
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${fileName ?? "evidence"} in a new tab`}
          className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full bg-background/90 shadow-sm"
        >
          <ExternalLink className="h-3 w-3 text-foreground" />
        </a>
      )}
      <div className="px-2 py-1.5 border-t border-border flex items-center justify-between gap-1">
        <Badge variant="outline" className={`text-xs ${tagColor}`}>
          {tag}
        </Badge>
        <div className="flex items-center gap-1">
          {onReplace && (
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11 px-3 text-xs text-primary hover:text-primary"
              onClick={onReplace}
              disabled={replacing}
            >
              {replacing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Replace
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            {new Date(createdAt).toLocaleDateString("en-NG", { month: "short", day: "numeric" })}
          </p>
        </div>
      </div>
    </div>
  );
}

export function SellerEvidenceSection({
  disputeId,
  disputeStatus,
  sellerEvidence,
  deliveryProofFiles,
  additionalEvidenceSubmitted,
  disputeOpenedAt,
  permissions,
  onRefetch,
}: SellerEvidenceSectionProps) {
  const [uploading, setUploading] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replacingEvidenceId, setReplacingEvidenceId] = useState<string | null>(null);

  // Separate prior evidence from additional evidence using dedicated type
  const priorEvidence = sellerEvidence.filter(
    (e) => e.type !== "seller_additional_dispute_evidence"
  );
  const additionalEvidence = sellerEvidence.filter(
    (e) => e.type === "seller_additional_dispute_evidence"
  );

  const uploadFile = async (
    file: File,
    mode: "upload" | "replace",
    oldEvidenceId?: string
  ) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("Unsupported format. Use JPEG, PNG, WEBP, MP4, MOV, or WEBM.");
      return;
    }

    const isVideo = file.type.startsWith("video/");
    const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(`File exceeds ${isVideo ? "50MB" : "10MB"} limit.`);
      return;
    }

    if (mode === "upload") setUploading(true);
    else setReplacing(true);

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

      const resourceType = isVideo ? "video" : "image";
      const uploadUrl = `https://api.cloudinary.com/v1_1/${signData.cloud_name}/${resourceType}/upload`;
      const uploadRes = await fetch(uploadUrl, { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("Upload failed");

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

      if (mode === "replace" && oldEvidenceId) {
        await replaceAdditionalEvidence(disputeId, oldEvidenceId, regData.file_id);
        toast.success("Evidence replaced successfully.");
      } else {
        await submitAdditionalEvidence(disputeId, regData.file_id);
        toast.success("Additional evidence uploaded successfully.");
      }
      onRefetch();
    } catch (err) {
      toast.error((err as Error).message || "Failed to upload evidence");
    } finally {
      setUploading(false);
      setReplacing(false);
      setReplacingEvidenceId(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (replaceInputRef.current) replaceInputRef.current.value = "";
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(file, "upload");
  };

  const handleReplaceSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !replacingEvidenceId) return;
    await uploadFile(file, "replace", replacingEvidenceId);
  };

  const startReplace = (evidenceId: string) => {
    setReplacingEvidenceId(evidenceId);
    setTimeout(() => replaceInputRef.current?.click(), 50);
  };

  const totalFiles = deliveryProofFiles.length + priorEvidence.length + additionalEvidence.length;

  return (
    <Card id="evidence">
      <CardHeader className="bg-muted/50 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Shield className="h-5 w-5 text-primary" />
          <div>
            <h3 className="text-lg font-bold text-foreground">Seller Evidence</h3>
            <p className="text-sm text-muted-foreground">
              {totalFiles} file{totalFiles !== 1 ? "s" : ""} on record
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 space-y-6">
        {/* Hidden replace file input */}
        <input
          ref={replaceInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
          onChange={handleReplaceSelect}
          className="hidden"
        />

        {/* Delivery Proof */}
        {deliveryProofFiles.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Package className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">
                Delivery Proof ({deliveryProofFiles.length})
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {deliveryProofFiles.map((f) => (
                <EvidenceFileCard
                  key={f.id}
                  fileUrl={f.file_url}
                  mimeType={f.mime_type}
                  fileName={f.file_name}
                  createdAt={f.created_at}
                  tag="Delivery Proof"
                  tagColor="bg-success/10 text-success border-success/20"
                />
              ))}
            </div>
          </div>
        )}

        {/* Prior Seller Evidence */}
        {priorEvidence.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">
                Seller Evidence ({priorEvidence.length})
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {priorEvidence.map((e) => (
                <EvidenceFileCard
                  key={e.id}
                  fileUrl={e.file_url}
                  mimeType={e.mime_type}
                  fileName={e.file_name}
                  createdAt={e.created_at}
                  tag="Seller Evidence"
                  tagColor="bg-primary/10 text-primary border-primary/20"
                />
              ))}
            </div>
          </div>
        )}

        {/* Additional Evidence */}
        {additionalEvidence.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Plus className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">
                Additional Evidence ({additionalEvidence.length})
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {additionalEvidence.map((e) => (
                <EvidenceFileCard
                  key={e.id}
                  fileUrl={e.file_url}
                  mimeType={e.mime_type}
                  fileName={e.file_name}
                  createdAt={e.created_at}
                  tag="Additional Evidence"
                  tagColor="bg-warning/10 text-warning border-warning/20"
                  onReplace={permissions.canReplaceAdditionalEvidence ? () => startReplace(e.id) : undefined}
                  replacing={replacing && replacingEvidenceId === e.id}
                />
              ))}
            </div>
          </div>
        )}

        {totalFiles === 0 && (
          <p className="text-xs text-muted-foreground italic">No seller evidence on file.</p>
        )}

        {/* Upload Additional Evidence CTA */}
        {permissions.canUploadAdditionalEvidence && (
            <div className="flex flex-col gap-4 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Upload className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">Upload Additional Evidence</p>
                <p className="text-xs text-muted-foreground">
                  You may upload 1 additional evidence file during the dispute.
                </p>
              </div>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? "Uploading…" : "Upload"}
              </Button>
            </div>
          </div>
        )}

        {additionalEvidenceSubmitted && !permissions.canReplaceAdditionalEvidence && (
          <div className="rounded-xl border border-border bg-muted/50 p-4 flex items-center gap-3">
            <Info className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              Additional dispute evidence already submitted. Maximum 1 allowed.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
