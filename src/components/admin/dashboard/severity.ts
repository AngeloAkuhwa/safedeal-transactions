import { ADMIN_TONE } from "@/components/admin/palette";
import type { Severity } from "@/services/admin-dashboard.service";

export const SEVERITY_BG: Record<Severity, string> = {
  blue: ADMIN_TONE.info.chip,
  red: ADMIN_TONE.danger.chip,
  orange: ADMIN_TONE.elevated.chip,
  purple: ADMIN_TONE.special.chip,
  cyan: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",
  yellow: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  emerald: ADMIN_TONE.success.chip,
};

export const SEVERITY_DOT: Record<Severity, string> = {
  blue: "bg-blue-400",
  red: "bg-red-400",
  orange: ADMIN_TONE.elevated.dot,
  purple: "bg-purple-400",
  cyan: "bg-cyan-300",
  yellow: "bg-amber-300",
  emerald: "bg-emerald-400",
};

export const SEVERITY_BTN: Record<Severity, string> = {
  blue: "bg-blue-500/15 text-blue-300 hover:bg-blue-500/25",
  red: "bg-red-500/15 text-red-300 hover:bg-red-500/25",
  orange: "bg-orange-500/15 text-orange-300 hover:bg-orange-500/25",
  purple: "bg-purple-500/15 text-purple-300 hover:bg-purple-500/25",
  cyan: "bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25",
  yellow: "bg-amber-500/15 text-amber-200 hover:bg-amber-500/25",
  emerald: "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25",
};