import { ActionConfirmDialog } from "@/components/admin/transactions/ActionConfirmDialog";
import type { InternalUser } from "@/services/admin-access-control.service";

interface Props {
  user: InternalUser | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: (reason: string) => Promise<void>;
}

export function SuspendUserDialog({ user, open, onOpenChange, onConfirm }: Props) {
  return (
    <ActionConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={user ? `Suspend ${user.full_name}` : ""}
      description="Suspended internal users lose console access immediately. This action is logged."
      reasonLabel="Reason"
      reasonPlaceholder="Explain why this user is being suspended…"
      confirmLabel="Suspend user"
      confirmTone="danger"
      onConfirm={onConfirm}
    />
  );
}