interface Props {
  online: boolean;
  /** ring color to blend with the card/page background */
  ringClass?: string;
  size?: "sm" | "md";
}

/** Small online/offline status dot for avatars. */
export function PresenceDot({ online, ringClass = "ring-slate-900", size = "sm" }: Props) {
  const sz = size === "md" ? "h-3 w-3" : "h-2.5 w-2.5";
  const color = online ? "bg-emerald-500" : "bg-slate-500";
  return (
    <span
      title={online ? "Online now" : "Offline"}
      aria-label={online ? "Online now" : "Offline"}
      className={`absolute -bottom-0.5 -right-0.5 ${sz} rounded-full ring-2 ${ringClass} ${color}`}
    />
  );
}

interface CountChipProps {
  online: number;
  offline: number;
  className?: string;
}

/** Compact "X online · Y offline" chip for headers. */
export function PresenceCountChip({ online, offline, className = "" }: CountChipProps) {
  return (
    <div
      title={`${online} online, ${offline} offline (this page)`}
      className={`inline-flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-medium ${className}`}
    >
      <span className="inline-flex items-center gap-1.5 text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 sd-live-dot" />
        {online} online
      </span>
      <span className="text-slate-600">·</span>
      <span className="inline-flex items-center gap-1.5 text-slate-400">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
        {offline} offline
      </span>
    </div>
  );
}