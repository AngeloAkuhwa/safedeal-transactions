import { ActionConfirmDialog } from "./ActionConfirmDialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactionCode: string;
  onSubmit: (note: string) => Promise<void>;
}

export function InternalNoteDialog({ open, onOpenChange, transactionCode, onSubmit }: Props) {
  return (
    <ActionConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add internal note"
      description={`Internal note for ${transactionCode}. Only admins can read these.`}
      reasonLabel="Note"
      reasonPlaceholder="Visible to admins only…"
      reasonMin={1}
      reasonMax={2000}
      confirmLabel="Save note"
      onConfirm={onSubmit}
    />
  );
}