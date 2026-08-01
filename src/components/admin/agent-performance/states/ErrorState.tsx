import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/5 p-10 text-center">
      <ShieldAlert className="mb-3 h-6 w-6 text-rose-300" aria-hidden />
      <div className="text-sm font-medium text-foreground">Something went wrong</div>
      <div className="mt-1 text-xs text-muted-foreground">{message}</div>
      <Button variant="outline" onClick={onRetry} className="mt-4">Retry</Button>
    </div>
  );
}