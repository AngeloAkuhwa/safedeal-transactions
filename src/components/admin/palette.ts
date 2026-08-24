/**
 * The admin back office's one colour vocabulary (plan 4.5, batch 1).
 *
 * The admin surface carries ~4,000 raw colour utilities, and the frequency
 * table behind this file showed they are one language spoken inline: a dark
 * slate ground, and per meaning a wash/text/border triad (emerald for a good
 * state, red for a bad one, amber and orange for degrees of caution, blue
 * for information, purple for the special case) repeated hundreds of times
 * with small accidental variations. Those variations are the defect: two
 * screens disagreeing by one shade about the same meaning.
 *
 * This module is the definition site. Screens consume tones by MEANING, and
 * the categorical scale exists for things that are categories rather than
 * judgements (internal roles, chart series). The class strings here are
 * character for character the most common triads already shipped, so
 * converting a call site to this module is provably pixel-identical; any
 * deliberate visual convergence (a stray shade folding into its tone) is a
 * separate change that ships with a preview, never smuggled into a
 * mechanical batch.
 *
 * The colour-law contract counts this file against the admin budget like
 * any other: the ratchet drops as call sites shed their own copies.
 */

/** A judgement about a state: how the back office reads it at a glance. */
export type AdminTone =
  | "success"
  | "danger"
  | "elevated"
  | "warning"
  | "info"
  | "special"
  | "neutral";

interface AdminToneClasses {
  /** Badge/pill triad at the standard intensity (wash 15, border 30). */
  badge: string;
  /** Softer triad for larger washes (wash 10, border 30). */
  panel: string;
  /** Standalone tinted text. */
  text: string;
  /** Status dot. */
  dot: string;
}

export const ADMIN_TONE: Record<AdminTone, AdminToneClasses> = {
  success: {
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    panel: "bg-emerald-500/10 border-emerald-500/30",
    text: "text-emerald-400",
    dot: "bg-emerald-400",
  },
  danger: {
    badge: "bg-red-500/15 text-red-300 border-red-500/30",
    panel: "bg-red-500/10 border-red-500/30",
    text: "text-red-400",
    dot: "bg-red-400",
  },
  /** The step above warning: locked accounts, critical-adjacent risk. */
  elevated: {
    badge: "bg-orange-500/15 text-orange-300 border-orange-500/30",
    panel: "bg-orange-500/10 border-orange-500/30",
    text: "text-orange-400",
    dot: "bg-orange-400",
  },
  warning: {
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    panel: "bg-amber-500/10 border-amber-500/30",
    text: "text-amber-300",
    dot: "bg-amber-400",
  },
  info: {
    badge: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    panel: "bg-blue-500/10 border-blue-500/30",
    text: "text-blue-400",
    dot: "bg-blue-400",
  },
  special: {
    badge: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    panel: "bg-purple-500/10 border-purple-500/30",
    text: "text-purple-400",
    dot: "bg-purple-400",
  },
  neutral: {
    badge: "bg-slate-500/15 text-slate-300 border-slate-500/30",
    panel: "bg-slate-500/10 border-slate-500/30",
    text: "text-slate-400",
    dot: "bg-slate-400",
  },
};

/**
 * Solid call-to-action surfaces: the filled buttons that COMMIT a judgement
 * (release funds, retry a payout) rather than labelling one. Only tones
 * that actually have a committing action get an entry; a tone missing here
 * has no solid form on purpose.
 */
export const ADMIN_SOLID: Partial<Record<AdminTone, string>> = {
  success: "bg-emerald-600 hover:bg-emerald-700 text-white",
  danger: "bg-red-600 hover:bg-red-700 text-white",
  info: "bg-blue-600 hover:bg-blue-700 text-white",
  special: "bg-purple-600 hover:bg-purple-700 text-white",
};

/**
 * The neutral slate ground the whole back office sits on. Named by role so
 * a screen says what a surface IS, not which slate step it happens to be.
 * Hover states ship beside their resting state because the pair is the
 * meaning: a raised control that lightens one step on hover.
 */
export const ADMIN_GROUND = {
  /** Page-level card: slate-900 with its hairline. */
  panel: "bg-slate-900 border-slate-800",
  /** Raised interactive surface (buttons, menus). */
  raised: "bg-slate-800",
  raisedHover: "hover:bg-slate-700",
  border: "border-slate-800",
  borderSoft: "border-slate-700",
  /** Primary text on the dark ground. */
  heading: "text-white",
  /** Body text. */
  body: "text-slate-300",
  /** Secondary text. */
  muted: "text-slate-400",
  /** Tertiary, receding text. */
  faint: "text-slate-500",
} as const;

/**
 * Categories, not judgements: internal roles and other same-rank groupings
 * where hue only needs to separate, never to warn. Kept apart from the tone
 * map so nobody reads meaning into a category hue.
 */
export type AdminCategoryHue =
  | "cyan"
  | "sky"
  | "fuchsia"
  | "indigo"
  | "violet";

export const ADMIN_CATEGORY: Record<AdminCategoryHue, string> = {
  cyan: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  sky: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  fuchsia: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  indigo: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  violet: "bg-violet-500/15 text-violet-300 border-violet-500/30",
};
