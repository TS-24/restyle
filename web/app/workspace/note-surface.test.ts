import { describe, expect, it } from "vitest";
import { fitToText } from "~/workspace/note-surface";

/*
  Measuring a field must never move what the reader is looking at.

  Sizing a textarea to its text means collapsing it to `auto` first, and the
  collapse shortens the document under it — so the browser clamps the scroll
  position before the real height goes back on, and the reader is thrown to the
  top on every keystroke past the first screenful. It has regressed twice: once
  on the page, once on a scroller inside the note. jsdom cannot reproduce either
  (no layout, so `scrollHeight` is always 0), so what is pinned here is the
  ordering, which is the part that was wrong both times.
*/

/**
 * A field that reports a fixed text height, and tells the scrollers when it has
 * been collapsed — which is the moment a real browser clamps them.
 */
function fieldOf(textHeight: number, onCollapse: () => void) {
  let height = "";
  const style = {
    get height() {
      return height;
    },
    set height(next: string) {
      height = next;
      if (next === "auto") onCollapse();
    },
  };
  return { scrollHeight: textHeight, style } as unknown as HTMLTextAreaElement;
}

/** A scroll position that jumps to the top when the content above it shortens. */
function clampingScroller(from: number) {
  let position = from;
  const writes: number[] = [];
  return {
    clamp: () => {
      position = 0;
    },
    writes,
    scroller: {
      at: () => position,
      to: (next: number) => {
        position = next;
        writes.push(next);
      },
    },
  };
}

describe("fitToText", () => {
  it("sizes the field to its text", () => {
    const field = fieldOf(390, () => {});

    fitToText(field, []);

    expect(field.style.height).toBe("390px");
  });

  it("puts back a scroll position the collapse moved", () => {
    // The whole bug in one line: the height is restored a statement later and
    // the scroll position is not, so the reader loses their place per keystroke.
    const column = clampingScroller(1420);
    const field = fieldOf(3900, column.clamp);

    fitToText(field, [column.scroller]);

    expect(column.scroller.at()).toBe(1420);
  });

  it("restores every scroller, not just the first one to move", () => {
    // The page and the note's own column can both be scrolled at once.
    const page = clampingScroller(240);
    const column = clampingScroller(1420);
    const field = fieldOf(3900, () => {
      page.clamp();
      column.clamp();
    });

    fitToText(field, [page.scroller, column.scroller]);

    expect([page.scroller.at(), column.scroller.at()]).toEqual([240, 1420]);
  });

  it("does not write to a scroller that never moved", () => {
    // Assigning scrollTop is not free — it cancels a smooth scroll in progress
    // and fires a scroll event — so a short note must not pay for the fix.
    const still = clampingScroller(0);
    const field = fieldOf(120, () => {});

    fitToText(field, [still.scroller]);

    expect(still.writes).toEqual([]);
  });
});
