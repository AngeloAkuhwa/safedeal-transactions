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
  /** Interactive chip triad (wash 10, border 20, text 400): the quieter,
      clickable form the notification and moderation queues use. Pair with
      chipHover on interactive chips; a static chip omits it. */
  chip: string;
  chipHover: string;
  /** Standalone tinted text. */
  text: string;
  /** Status dot. */
  dot: string;
}

export const ADMIN_TONE: Record<AdminTone, AdminToneClasses> = {
  success: {
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    panel: "bg-emerald-500/10 border-emerald-500/30",
    chip: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    chipHover: "hover:bg-emerald-500/20",
    text: "text-emerald-400",
    dot: "bg-emerald-400",
  },
  danger: {
    badge: "bg-red-500/15 text-red-300 border-red-500/30",
    panel: "bg-red-500/10 border-red-500/30",
    chip: "bg-red-500/10 border-red-500/20 text-red-400",
    chipHover: "hover:bg-red-500/20",
    text: "text-red-400",
    dot: "bg-red-400",
  },
  /** The step above warning: locked accounts, critical-adjacent risk. */
  elevated: {
    badge: "bg-orange-500/15 text-orange-300 border-orange-500/30",
    panel: "bg-orange-500/10 border-orange-500/30",
    chip: "bg-orange-500/10 border-orange-500/20 text-orange-400",
    chipHover: "hover:bg-orange-500/20",
    text: "text-orange-400",
    dot: "bg-orange-400",
  },
  warning: {
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    panel: "bg-amber-500/10 border-amber-500/30",
    chip: "bg-amber-500/10 border-amber-500/20 text-amber-400",
    chipHover: "hover:bg-amber-500/20",
    text: "text-amber-300",
    dot: "bg-amber-400",
  },
  info: {
    badge: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    panel: "bg-blue-500/10 border-blue-500/30",
    chip: "bg-blue-500/10 border-blue-500/20 text-blue-400",
    chipHover: "hover:bg-blue-500/20",
    text: "text-blue-400",
    dot: "bg-blue-400",
  },
  special: {
    badge: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    panel: "bg-purple-500/10 border-purple-500/30",
    chip: "bg-purple-500/10 border-purple-500/20 text-purple-400",
    chipHover: "hover:bg-purple-500/20",
    text: "text-purple-400",
    dot: "bg-purple-400",
  },
  neutral: {
    badge: "bg-slate-500/15 text-slate-300 border-slate-500/30",
    panel: "bg-slate-500/10 border-slate-500/30",
    chip: "bg-slate-500/10 border-slate-500/20 text-slate-400",
    chipHover: "hover:bg-slate-500/20",
    text: "text-slate-400",
    dot: "bg-slate-400",
  },
};

/**
 * Solid call-to-action surfaces: the filled buttons that COMMIT a judgement
 * (release funds, retry a payout) rather than labelling one. Only tones
 * that actually have a committing action get an entry; a tone missing here
 * has no solid form on purpose.
 *
 * **The resting step is 700 because 600 was not readable.** These sat at
 * `bg-<hue>-600 text-white`, which measures 3.19:1 for amber, 3.56:1 for
 * orange and 3.77:1 for emerald against the 4.5:1 the colour law requires.
 * The buttons only crossed the bar on HOVER, at their 700 step, which is
 * backwards: the resting state is the one you read before deciding to press
 * it, and the highest-stakes controls in the back office had the least
 * readable labels. Nobody caught it in review because a contrast ratio is
 * not visible in a class name; `tinted-text-contrast.contract` now computes
 * it, and computing it is what found this.
 *
 * Every tone moved, not only the three that failed. Red, blue and purple
 * cleared at 600 by a margin of 0.33 to 0.88, and splitting the map across
 * two steps to save them would trade a readable rule ("a white label sits on
 * the 700 step") for six values a reviewer has to check individually. The
 * hover step moves with it, so hover stays a darkening rather than becoming
 * a lightening; the guard pins that direction, because a fix that quietly
 * inverted the interaction would be a behaviour change smuggled inside a
 * colour change.
 */
export const ADMIN_SOLID: Partial<Record<AdminTone, string>> = {
  success: "bg-emerald-700 hover:bg-emerald-800 text-white",
  danger: "bg-red-700 hover:bg-red-800 text-white",
  info: "bg-blue-700 hover:bg-blue-800 text-white",
  special: "bg-purple-700 hover:bg-purple-800 text-white",
  warning: "bg-amber-700 hover:bg-amber-800 text-white",
  // Orange had committing actions and no entry, so its buttons were
  // written by hand. Added at the pattern every other tone already
  // follows (resting, then one step darker on hover) rather than as a
  // new idea.
  elevated: "bg-orange-700 hover:bg-orange-800 text-white",
};

/**
 * The heavy pill: one step above the badge on both the wash and the border.
 *
 * Measuring the wash question found six intensities in use and no entry for
 * the 20% tier, 108 sites of it. Reading where it lands settled what to do:
 * the flagged-user risk tiers all use ONE recipe, a 20% wash with a 40%
 * border, applied identically across critical, high and medium. That is the
 * surface making a severity distinction the badge cannot make, so it earns
 * an entry rather than being folded into the badge and erased.
 *
 * Partial, like ADMIN_SOLID and for the same reason: only the tones that
 * genuinely carry a heavier form get one. A tone missing here has no heavy
 * pill on purpose.
 */
export const ADMIN_BADGE_STRONG: Partial<Record<AdminTone, string>> = {
  danger: "bg-red-500/20 border-red-500/40 text-red-300",
  elevated: "bg-orange-500/20 border-orange-500/40 text-orange-300",
  warning: "bg-amber-500/20 border-amber-500/40 text-amber-300",
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

/**
 * The case timeline's vocabulary: a status dot and the header tint beside it.
 *
 * This existed twice, character for character, in `AdminCaseTimeline` and in
 * `AdminDisputeDetail`, which is rule 7's failure mode and the reason the two
 * timelines were free to drift. Consolidating it here also settles the header
 * tint, which sat at the 300 step in both copies while every other standalone
 * tinted text in the back office reads its tone's `.text`. The dots keep their
 * 500 step verbatim: no palette entry carries a 500 dot, and a mechanical
 * consolidation is not the place to invent one.
 *
 * `muted` deliberately has no text entry. An untoned header inherits its
 * colour today, and giving it a slate tint would be a new decision wearing a
 * consolidation's clothes.
 */
export const ADMIN_TIMELINE: Record<string, { dot: string; text?: string }> = {
  green: { dot: "bg-emerald-500", text: ADMIN_TONE.success.text },
  red: { dot: "bg-red-500", text: ADMIN_TONE.danger.text },
  orange: { dot: "bg-orange-500", text: ADMIN_TONE.elevated.text },
  blue: { dot: "bg-blue-500", text: ADMIN_TONE.info.text },
  muted: { dot: "bg-muted-foreground/60" },
};

/**
 * One focus treatment for the whole back office.
 *
 * Measured before this existed: 35 focus declarations across 14 admin files
 * in SEVEN different hues, and the hue tracked the SCREEN rather than the
 * state. Flagged users focused red, escrow and payouts focused emerald,
 * disputes focused orange, everything else focused blue at four different
 * opacities. So a search box on the flagged-users page announced itself in
 * the colour this product reserves for something being wrong, and the same
 * box on the payouts page announced itself in the colour reserved for
 * something having completed. Neither is what "the cursor is here" means, and
 * the colour law says so directly: destructive for real problems, success for
 * a genuinely completed state.
 *
 * Nothing outside admin has this problem, because every customer surface
 * focuses through the shadcn primitives and inherits `ring-ring` once.
 *
 * The value is the plurality recipe, character for character, so the five
 * sites that already wrote it do not move a pixel and the rest converge on
 * something that was already the house style rather than on a new invention.
 *
 * `focus:` rather than `focus-visible:` is deliberate and NOT an endorsement:
 * it is what all 35 sites used, and swapping the trigger would change which
 * interactions light up on every admin input at the same time as changing the
 * colour. Two changes at once is how a consolidation stops being provable.
 * Moving to `focus-visible` is its own pass.
 */
export const ADMIN_FOCUS =
  "focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/40";

/**
 * The same treatment for controls that trigger on `focus-visible`.
 *
 * Two entries rather than one, because the surface genuinely has two triggers
 * and collapsing them would smuggle a behaviour change into a colour change.
 * `focus:` fires on a mouse click as well as a keyboard tab; `focus-visible:`
 * only on the tab. The second is the better default and the newer half of this
 * codebase already uses it, so both are kept and the difference between them
 * is now the trigger alone, not the colour.
 *
 * These 14 sites were missed by the first sweep, which grepped `focus:` and
 * did not think of the longer prefix. The contract test found them, which is
 * the argument for writing the guard before believing the measurement.
 *
 * The ring is 2 rather than 1 here, matching what these sites already wrote:
 * a focus-visible ring is keyboard-only and carries the whole affordance on
 * its own, with no border change beside it.
 */
export const ADMIN_FOCUS_VISIBLE =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60";
