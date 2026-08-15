import { useState } from "react";
import { Ban, CheckCircle2, ArrowUpRight, StickyNote, Loader2, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  performFlaggedBulkAction,
  type FlaggedBulkActionType,
} from "@/services/admin-flagged-users.service";
import { toast } from "@/hooks/use-toast";

interface Props {
  userIds: string[];
  onClear: () => void;
}

const ACTIONS: { key: FlaggedBulkActionType; label: string; icon: typeof Ban; cls: string }[] = [
  { key: "suspend", label: "Suspend", icon: Ban, cls: "bg-purple-600 hover:bg-purple-700" },
  { key: "clear", label: "Clear", icon: CheckCircle2, cls: "bg-emerald-600 hover:bg-emerald-700" },
  { key: "escalate", label: "Escalate", icon: ArrowUpRight, cls: "bg-orange-600 hover:bg-orange-700" },
  { key: "add_note", label: "Add Note", icon: StickyNote, cls: "bg-slate-700 hover:bg-slate-600" },
];

export function FlaggedBulkActionBar({ userIds, onClear }: Props) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<FlaggedBulkActionType | null>(null);

  const run = async (action: FlaggedBulkActionType) => {
    if (!note.trim()) {
      toast({ title: "Note required", description: "Add a short reason before running a bulk action.", variant: "destructive" });
      return;
    }
    setPending(action);
    try {
      const r = await performFlaggedBulkAction(action, userIds, note.trim());
      toast({
        title: `Bulk ${action} complete`,
        description: `${r.success_count} succeeded, ${r.failure_count} failed`,
      });
      setNote("");
      onClear();
      await qc.invalidateQueries({ queryKey: ["admin-flagged-users"] });
    } catch (e) {
      toast({ title: `Bulk ${action} failed`, description: (e as Error).message, variant: "destructive" });
    } finally {
      setPending(null);
    }
  };

  if (userIds.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-overlay w-[95%] max-w-3xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-white text-sm font-semibold">
          {userIds.length} selected
        </span>
        <button
          type="button" onClick={onClear} aria-label="Clear selection"
          className="h-11 w-11 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Required note for this bulk action…"
        className="w-full min-h-11 mb-2 p-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-red-500"
      />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {ACTIONS.map(({ key, label, icon: Icon, cls }) => (
          <button
            key={key}
            type="button"
            disabled={!!pending}
            onClick={() => run(key)}
            className={`min-h-11 px-3 py-2 ${cls} disabled:opacity-50 rounded-lg flex items-center justify-center gap-2 text-white text-xs font-semibold`}
          >
            {pending === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}