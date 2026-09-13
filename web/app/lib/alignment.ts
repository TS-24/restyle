/**
 * How a note's own text is aligned.
 *
 * A preference rather than a constant because it is genuinely a matter of
 * taste: the app was drawn with the note centred (DESIGN.md §4), which reads
 * as a page in a book, and it is also the least usual way to set prose. Both
 * positions are defensible, so this is a setting instead of an argument.
 *
 * Only metadata lives here. The alignment itself is CSS, in `app.css` under
 * `[data-note-align="<id>"]`, for the same reason the palettes are: the rule has to
 * reach a textarea and several markdown blocks, and duplicating the values into
 * TypeScript would only give the two copies a chance to disagree.
 * `alignment.test.ts` asserts this list and that file agree.
 *
 * It is one value for both of the note surface's modes on purpose — see
 * `note-surface.tsx`. `text-align` cannot be tweened, so an alignment that
 * differed between boxed and full-page would snap the words sideways the
 * instant the box arrived.
 */
export interface Alignment {
  id: string;
  label: string;
}

export const ALIGNMENTS: Alignment[] = [
  { id: "left", label: "Left" },
  { id: "center", label: "Centre" },
  { id: "right", label: "Right" },
];

/**
 * Flush left, and the fallback.
 *
 * Not what the app was drawn in. Centred prose is the harder thing to read at
 * the length a note reaches — every line starts in a different place, so the
 * eye has to find the beginning of each one — and a note is the one surface
 * here that exists to be written in rather than looked at. Centre is one
 * choice away for anyone who wants the drawn look back.
 */
export const DEFAULT_ALIGNMENT = ALIGNMENTS[0];

/** A cookie value is arbitrary text until it matches something we ship. */
export function resolveAlignment(id: string | null | undefined): Alignment {
  return ALIGNMENTS.find((alignment) => alignment.id === id) ?? DEFAULT_ALIGNMENT;
}

/**
 * What an alignment puts on `<html>`.
 *
 * One attribute, unlike a theme's two: there is no shadcn rule keying off a
 * class here, only this app's own stylesheet.
 *
 * `data-note-align` and not `data-align`, which is taken. base-ui writes
 * `data-align="start|center|end"` on every popup it positions, so a bare
 * `[data-align="center"]` rule here would also match any popup that happened
 * to be centred, and hand it a `--note-align` it never asked for.
 *
 * Accepts `undefined` because `Layout` also renders the error boundary, where
 * the root loader never ran and there is nothing to read.
 */
export function alignmentAttributes(alignment: Alignment | undefined): {
  "data-note-align": string;
} {
  return { "data-note-align": (alignment ?? DEFAULT_ALIGNMENT).id };
}

/**
 * Realign the page without waiting for the server.
 *
 * Same bargain as `applyTheme`: the switch is a form post and the root loader
 * re-running with the new cookie is what makes it authoritative, but that is a
 * round trip, and a control that lags a click feels broken. This sets exactly
 * what the server would, which is what stops the page moving twice.
 *
 * Browser only: there is no `document` on the server.
 */
export function applyAlignment(alignment: Alignment): void {
  document.documentElement.dataset.noteAlign = alignment.id;
}
