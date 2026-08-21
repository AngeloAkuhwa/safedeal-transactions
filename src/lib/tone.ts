/**
 * The one tone scale.
 *
 * Every surface that wanted to say "good", "careful" or "wrong" reached for a
 * raw Tailwind palette and wrote its own pairing: `bg-emerald-50
 * text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300` in one file,
 * `bg-green-100 text-green-800` in the next, and a third that forgot the dark
 * variant entirely and rendered near-black text on near-black. There were
 * hundreds of them, no two quite alike, and none of them followed the theme.
 *
 * `src/index.css` already defines the semantic tokens. This maps a tone onto
 * them once, so a component asks for a meaning rather than for a colour.
 *
 * The split into `surface`, `icon` and `bar` is not decoration, it is the
 * contrast rule. `--warning` is 38 92% 50% and `--success` is 142 71% 45%:
 * bright, and neither reaches 4.5:1 as text on the light background. So the
 * colour goes where contrast is not measured against a body-text bar, which is
 * the wash, the hairline and the glyph, and the words run at `text-foreground`.
 * That is both compliant and more legible than the tinted text it replaces.
 *
 * Meaning stays honest: `success` is a genuinely completed state, `warning` and
 * `danger` are real problems, `info` is the single accent, and anything neutral
 * stays `muted` rather than being coloured because a tile looked empty.
 */
export type Tone = "success" | "warning" | "danger" | "info" | "muted";

export interface ToneClasses {
  /** Wash plus hairline. Pair with `text-foreground` for the words. */
  surface: string;
  /** The glyph, where colour is allowed to carry weight. */
  icon: string;
  /** A solid fill: progress bars, chart series, sparkline strokes. */
  bar: string;
}

export const TONE: Record<Tone, ToneClasses> = {
  success: {
    surface: "border-success/35 bg-success/10",
    icon: "text-success",
    bar: "bg-success",
  },
  warning: {
    surface: "border-warning/35 bg-warning/10",
    icon: "text-warning",
    bar: "bg-warning",
  },
  danger: {
    surface: "border-destructive/35 bg-destructive/10",
    icon: "text-destructive",
    bar: "bg-destructive",
  },
  info: {
    surface: "border-primary/35 bg-primary/10",
    icon: "text-primary",
    bar: "bg-primary",
  },
  muted: {
    surface: "border-border bg-muted",
    icon: "text-muted-foreground",
    bar: "bg-muted-foreground/40",
  },
};

/** Convenience for the common "wash, hairline, full-contrast words" chip. */
export const toneChip = (tone: Tone) => `${TONE[tone].surface} text-foreground`;
