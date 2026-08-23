import { useState, useRef, useCallback } from "react";
import { X, Paperclip, Send, Loader2, FileText } from "lucide-react";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { keyActivate } from "@/lib/a11y";

interface AttachedFile {
  id: string;
  file: File;
  preview?: string;
}

interface ContactSellerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sellerName: string;
  transactionId: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];

export function ContactSellerModal({
  open,
  onOpenChange,
  sellerName,
  transactionId,
}: ContactSellerModalProps) {
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    const valid: AttachedFile[] = [];

    for (const file of arr) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        toast({
          title: "File type not supported",
          description: `${file.name} must be an image or PDF.`,
          variant: "destructive",
        });
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds 10MB limit.`,
          variant: "destructive",
        });
        continue;
      }
      const id = `${file.name}-${Date.now()}-${Math.random()}`;
      const preview = file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : undefined;
      valid.push({ id, file, preview });
    }

    setFiles((prev) => [...prev, ...valid]);
  }, []);

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target?.preview) URL.revokeObjectURL(target.preview);
      return prev.filter((f) => f.id !== id);
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const handleSend = async () => {
    const trimmed = message.trim();
    if (trimmed.length < 10) {
      toast({
        title: "Message too short",
        description: "Please write at least 10 characters.",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: "Not authenticated",
          description: "Please log in to send messages.",
          variant: "destructive",
        });
        setIsSending(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("send-seller-message", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { transaction_id: transactionId, message: trimmed },
      });

      if (error || data?.error) {
        throw new Error(data?.error || error?.message || "Failed to send message");
      }

      toast({
        title: "Message sent!",
        description: `Your message has been securely delivered to ${sellerName}.`,
      });

      // Reset
      setMessage("");
      files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
      setFiles([]);
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: "Failed to send",
        description: err.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    if (isSending) return;
    files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
    setFiles([]);
    setMessage("");
    onOpenChange(false);
  };

  const isValid = message.trim().length >= 10;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={handleClose}
      title={`Send Message to ${sellerName}`}
      description="Messages are delivered securely through SafeDeal. Do not share payment details outside the platform."
      footer={
        <>
          {/* Cancel first in the DOM so it lands left of the send button in the
              dialog and above it in the sheet, which puts the action the buyer
              actually came for nearest the thumb. */}
          <Button
            variant="outline"
            className="w-full font-semibold rounded-xl md:w-auto"
            onClick={handleClose}
            disabled={isSending}
          >
            Cancel
          </Button>
          <Button
            className="w-full font-bold rounded-xl md:w-auto"
            onClick={handleSend}
            disabled={!isValid || isSending}
          >
            {isSending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
            ) : (
              <><Send className="h-4 w-4" /> Send Message</>
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Textarea */}
        <div>
          <Textarea
            placeholder="Describe your question or concern clearly… (min. 10 characters)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="min-h-[120px] resize-none text-sm"
            disabled={isSending}
          />
          <p className={cn(
            "text-xs mt-1 text-right transition-colors",
            message.trim().length < 10 && message.length > 0
              ? "text-destructive"
              : "text-muted-foreground"
          )}>
            {message.trim().length} / min. 10 chars
          </p>
        </div>

        {/* Drop zone */}
        <div role="button" tabIndex={0} onKeyDown={keyActivate}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors",
            isDragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-muted/40"
          )}
        >
          <Paperclip className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Drag & drop or <span className="text-primary font-semibold">browse</span>: images & PDFs, up to 10MB each
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf"
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
        </div>

        {/* File chips */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {files.map((af) => (
              <div
                key={af.id}
                className="flex items-center gap-2 bg-muted rounded-lg px-3 py-1.5 text-xs font-medium text-foreground max-w-[200px]"
              >
                {af.preview ? (
                  <img src={af.preview} alt="" className="h-5 w-5 rounded object-cover shrink-0" />
                ) : (
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate">{af.file.name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); removeFile(af.id); }}
                  className="ml-1 shrink-0 text-muted-foreground hover:text-destructive transition-colors relative inline-flex items-center justify-center before:absolute before:-inset-4 before:content-[''] min-h-11 min-w-11"
                  aria-label="Remove file"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

      </div>
    </ResponsiveDialog>
  );
}
