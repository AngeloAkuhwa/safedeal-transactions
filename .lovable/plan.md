# Case Timeline + Internal Notes — Pixel Alignment Pass

Scope: presentation only in `src/pages/AdminDisputeDetail.tsx`. No data, schema, or service changes.

## Problem (what doesn't match the screenshot)

**Case Timeline**
- Current render uses one continuous `border-l` on the container, so the rail runs through the status header ("Escalated") — in the screenshot the status row has only a dot and **no rail** beside it.
- Because the rail is on the container, the gap between items is filled by the rail (continuous line). The screenshot shows **per-item line segments** that visibly break between cards, giving the staggered look.
- Each entry needs its own short vertical segment that starts at the title and ends at the date, with a small empty gap before the next item begins.

**Internal Notes & Investigation**
- Note body is currently indented with `pl-11` (sits under the author text). Screenshot shows the body text **flush to the card's left padding**, full width.
- Pill ("ESCALATION" / "INVESTIGATION" / "AGENT NOTE") must sit **top-right of the card**, vertically aligned to the author row — current works but spacing needs to match (`px-2.5 py-1`, rounded-md not full).
- Header row layout already correct (avatar + name + "{type} • {date}"). Keep.

## A. Timeline rail — restructure

Replace the single container rail with per-item rails:

```
<div className="space-y-4">
  {header && (
    // Status pill row: dot only, NO border-l
    <div className="flex items-center gap-2 pl-0">
      <span className="h-2.5 w-2.5 rounded-full {toneBg}" />
      <span className="text-sm font-semibold {toneText}">{header.label}</span>
    </div>
  )}
  {rows.map(r => (
    <div className="border-l-2 border-border/60 pl-4 py-0.5">
      <div className="text-sm font-semibold text-foreground">{r.title}</div>
      {r.description && <div className="text-xs text-muted-foreground mt-1">{r.description}</div>}
      <div className="text-[11px] text-muted-foreground mt-1.5">
        {fmtDate(r.raw.at)}{r.raw.type === "admin_action" && <> · by {r.actor ?? "SafeDeal Admin"}</>}
      </div>
    </div>
  ))}
</div>
```

Key changes:
- Drop `relative pl-5 border-l border-border` from the container.
- Status header row: no rail, no left padding — just dot + label (orange for escalated/under_review, red for open, green for resolved).
- Each event row gets its own `border-l-2 border-border/60 pl-4` so the rail visibly segments per item with `space-y-4` creating the gap.
- Remove the per-item absolute dot (`absolute -left-[26px]`) — the screenshot has no dots on individual rows, only on the status header.
- Title weight bumped to `font-semibold` to match screenshot.

## B. Internal Notes — layout cleanup

In `NotesList`:
- Remove `pl-11` from the body `<p>` so the note text aligns to the card's natural left padding (`p-4`), matching the screenshot.
- Pill styling: change from `rounded-full px-2 py-0.5 text-[10px]` to `rounded-md px-2.5 py-1 text-[10px]` with the same color classes (ESCALATION red, INVESTIGATION purple, AGENT NOTE slate, FOLLOW-UP amber). Keep `uppercase tracking-wide font-bold`.
- Author row spacing unchanged. Body sits below header row with `mt-1` (instead of `space-y-2` which adds too much gap).

## C. Out of scope

No changes to data fetching, `humanizeTimelineEntry`, `collapseAdminTriplets`, `parseInternalNoteTag`, the `+ Add Note` button, sidebar, or any other section. This is a pure layout/CSS pass on the two render functions: `Timeline` and `NotesList`.

## Files touched

- `src/pages/AdminDisputeDetail.tsx` — `Timeline` component (~line 2037) and `NotesList` component (~line 1837).
