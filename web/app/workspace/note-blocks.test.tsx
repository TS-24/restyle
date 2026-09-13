/**
 * @vitest-environment jsdom
 *
 * Only the block under the caret shows its bones.
 *
 * PR #52 made a note render as markdown at rest and swap to raw text when you
 * write in it — but it swapped the *whole* note, so clicking one paragraph
 * turned every heading and list in the document back into `##` and `-`. Now the
 * text above and below the caret stays rendered and only the block you are in
 * is source.
 *
 * There is still exactly one textarea on the page, which is what lets
 * `fitToText`, `useAutoHeight`, `caretOnEnter` and save-on-blur all keep
 * working on the same ref they always used.
 *
 * The four edge crossings are the part that needs pinning: separate render
 * regions do not share a caret, so arrowing off the top of a block and deleting
 * back across a boundary have to be arranged by hand.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, expect, test, vi } from "vitest";

import NoteSurface from "~/workspace/note-surface";
import type { Note } from "~/lib/types";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const NOW = "2026-01-01T00:00:00Z";

// A heading, two paragraphs and a list — four top-level blocks.
const TEXT = "## Tides\n\nThe moon pulls.\n\nTwice a day.\n\n- spring\n- neap";

const note: Note = {
  id: 3,
  title: "Tides",
  content: TEXT,
  user_id: 1,
  is_pinned: false,
  created_at: NOW,
  updated_at: NOW,
  archived_at: null,
};

let cleanup = () => {};
afterEach(() => cleanup());

function mount(subject: Note = note) {
  const container = document.createElement("div");
  document.body.append(container);
  const saved: Array<Record<string, string>> = [];
  const closes = { count: 0 };
  const router = createMemoryRouter(
    [
      {
        path: "/notes",
        async action({ request }) {
          saved.push(Object.fromEntries(await request.formData()) as Record<string, string>);
          return { ok: true };
        },
        Component: () => (
          <NoteSurface
            note={subject}
            mode="boxed"
            conversationId={null}
            onOpen={() => {}}
            onClose={() => {
              closes.count += 1;
            }}
            onReturn={() => {}}
          />
        ),
      },
    ],
    { initialEntries: ["/notes"] },
  );
  const root = createRoot(container);
  act(() => {
    root.render(<RouterProvider router={router} />);
  });
  cleanup = () => {
    act(() => root.unmount());
    container.remove();
  };

  const field = () =>
    container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Note text"]');

  return {
    container,
    saved,
    closes,
    field,
    fields: () => container.querySelectorAll('textarea[aria-label="Note text"]'),
    body: () => container.querySelector("[data-note-body]"),
    click: (el: Element | null) => {
      if (!el) throw new Error("nothing to click");
      return act(() => {
        el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      });
    },
    /** Put the caret somewhere in the live field and fire the key. */
    press: async (key: string, at: number) => {
      const f = field();
      if (!f) throw new Error("no field");
      f.setSelectionRange(at, at);
      await act(async () => {
        f.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      });
    },
    type: async (value: string) => {
      const f = field();
      if (!f) throw new Error("no field");
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!;
      await act(async () => {
        setter.call(f, value);
        f.dispatchEvent(new Event("input", { bubbles: true }));
      });
    },
  };
}

const paragraphSaying = (surface: ReturnType<typeof mount>, text: string) =>
  [...surface.container.querySelectorAll("p")].find(p => p.textContent === text) ?? null;

test("clicking a paragraph opens only that paragraph", async () => {
  const surface = mount();

  await surface.click(paragraphSaying(surface, "Twice a day."));

  expect(surface.fields()).toHaveLength(1);
  expect(surface.field()?.value).toBe("Twice a day.");
});

test("the blocks around it stay rendered", async () => {
  const surface = mount();

  await surface.click(paragraphSaying(surface, "Twice a day."));

  // This is the whole feature: the heading above and the list below are still
  // elements, not `##` and `-` in a textarea.
  expect(surface.body()?.querySelector("h2")?.textContent).toBe("Tides");
  expect(surface.body()?.querySelectorAll("li")).toHaveLength(2);
});

test("clicking another block while one is open moves to it", async () => {
  // The gap this exists for: `handleMouseDown` used to hand every click to the
  // live field once one existed, because there was only ever one block to be
  // in. With the rest of the note still rendered and still clickable, a click
  // on it has to mean *that* block.
  const surface = mount();
  await surface.click(paragraphSaying(surface, "Twice a day."));
  expect(surface.field()?.value).toBe("Twice a day.");

  await surface.click(paragraphSaying(surface, "The moon pulls."));

  expect(surface.field()?.value).toBe("The moon pulls.");
  expect(surface.fields()).toHaveLength(1);
});

test("clicking a block *below* the open one moves to it", async () => {
  // `above` and `below` are rendered as two separate markdown documents, so the
  // source lines remark reports for `below` start at 1 again. Left uncorrected
  // that resolves a click near the bottom of a note to a block near the top.
  const surface = mount();
  await surface.click(paragraphSaying(surface, "The moon pulls."));

  await surface.click(surface.container.querySelector("li"));

  expect(surface.field()?.value).toBe("- spring\n- neap");
});

test("clicking the list opens the whole list, not one item", async () => {
  const surface = mount();

  await surface.click(surface.container.querySelector("li"));

  expect(surface.field()?.value).toBe("- spring\n- neap");
});

test("typing in a block leaves the rest of the note untouched", async () => {
  const surface = mount();
  await surface.click(paragraphSaying(surface, "Twice a day."));

  await surface.type("Twice a day, roughly.");
  await act(async () => {
    surface.field()?.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
  });

  expect(surface.body()?.querySelector("h2")?.textContent).toBe("Tides");
  expect(surface.field()?.value ?? "").not.toContain("## Tides");
});

test("ArrowDown off the last line moves to the next block", async () => {
  const surface = mount();
  await surface.click(paragraphSaying(surface, "The moon pulls."));

  await surface.press("ArrowDown", "The moon pulls.".length);

  expect(surface.field()?.value).toBe("Twice a day.");
});

test("ArrowUp off the first line moves to the block above", async () => {
  const surface = mount();
  await surface.click(paragraphSaying(surface, "Twice a day."));

  await surface.press("ArrowUp", 0);

  expect(surface.field()?.value).toBe("The moon pulls.");
});

test("Backspace at the very start merges into the block above", async () => {
  const surface = mount();
  await surface.click(paragraphSaying(surface, "Twice a day."));

  await surface.press("Backspace", 0);

  // The blank line between them is gone, so the two paragraphs are one block.
  expect(surface.field()?.value).toBe("The moon pulls.\nTwice a day.");
});

test("Backspace in the middle of a block is left to the browser", async () => {
  const surface = mount();
  await surface.click(paragraphSaying(surface, "Twice a day."));

  await surface.press("Backspace", 5);

  expect(surface.field()?.value).toBe("Twice a day.");
});

test("closing saves the whole note, not the block that was open", async () => {
  // The field holds one block; `content` is still the whole document, and that
  // is what has to reach the server. Editing a paragraph must not truncate the
  // note to that paragraph.
  const surface = mount();
  await surface.click(paragraphSaying(surface, "Twice a day."));
  await surface.type("Twice a day, roughly.");

  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  });

  const sent = surface.saved.at(-1);
  expect(sent?.intent).toBe("update");
  expect(sent?.content).toBe(
    "## Tides\n\nThe moon pulls.\n\nTwice a day, roughly.\n\n- spring\n- neap",
  );
});

/*
  An empty note has no blocks, and a note you cannot click into is a note you
  cannot write in.

  This is the seam between two changes that were built on separate branches and
  are both correct alone. #56 made every new note start genuinely empty — no
  title, no body — so that closing one without writing deletes it. #57 made the
  body open one *block* at a time, and blocks come from parsing the text: empty
  text parses to none. `blockAtOffset` then has nothing to return but null,
  `goTo(null)` is the resting state, and the field never opens.

  So every note the app creates — "New note", the loader's first note, the one
  behind every new conversation — cannot be typed into at all. The fixtures in
  this file all have text in them, which is why nothing here saw it.
*/
const blank: Note = { ...note, title: "", content: "" };

test("an empty note can be written in", async () => {
  const surface = mount(blank);

  await surface.click(surface.body());

  expect(surface.field()).not.toBeNull();
});

test("the first thing typed into an empty note is kept", async () => {
  const surface = mount(blank);

  await surface.click(surface.body());
  await surface.type("first words");

  expect(surface.field()?.value).toBe("first words");
});

test("clearing a note's text does not close the field under the caret", async () => {
  // The same seam from the other side: emptying the *whole* note mid-edit
  // leaves no blocks to be in, and the reader is still writing. Losing the
  // field here loses focus with it, so the next character goes nowhere.
  //
  // It has to be a note of one block. Clearing one of four leaves three, and
  // `blockAtOffset` still has an answer.
  const surface = mount({ ...note, content: "The moon pulls." });

  await surface.click(paragraphSaying(surface, "The moon pulls."));
  await surface.type("");

  expect(surface.field()).not.toBeNull();
});

test("Enter at the end of a block starts a new line", async () => {
  // Enter is a paragraph break in the body, not a commit. The native newline
  // lands in the field, and the field must still be holding it afterwards:
  // remark ends a paragraph node *before* its trailing newline, so splicing
  // the block back out of the note used to swallow the character the reader
  // just typed and Enter appeared to do nothing at all.
  const surface = mount();

  await surface.click(paragraphSaying(surface, "Twice a day."));
  await surface.type("Twice a day.\n");

  expect(surface.field()?.value).toBe("Twice a day.\n");
});

/*
  The click that opens a block is the click that used to close the note.

  mousedown is a discrete event, so React flushes the `setActive` from
  `handleMouseDown` synchronously before the event finishes bubbling to
  `document` — and the collapse listener there then sees a target that has been
  replaced by the field. Measured in Chrome on the boxed note: the same `<li>`
  reports `isConnected: true` in the capture phase and `false` in the bubble
  phase, and `contains` on a detached node is false, so a click in the middle of
  the note read as a click outside it and closed it.

  jsdom does not reproduce that flush — React commits in a microtask there, so
  the behavioural half below passes with or without the fix and is kept only as
  a description of the outcome. The phase is what actually has to hold, and it
  is the one thing jsdom can be held to.
*/
test("clicking the note's own text does not close the note", async () => {
  const surface = mount();

  await surface.click(paragraphSaying(surface, "Twice a day."));

  expect(surface.closes.count).toBe(0);
  expect(surface.field()?.value).toBe("Twice a day.");
});

test("the outside-click listener runs before React can detach the target", () => {
  const added: Array<boolean | AddEventListenerOptions | undefined> = [];
  const real = document.addEventListener.bind(document);
  const spy = vi
    .spyOn(document, "addEventListener")
    .mockImplementation((type, listener, options) => {
      if (type === "mousedown") added.push(options);
      real(type, listener, options);
    });

  mount();
  spy.mockRestore();

  expect(added).not.toEqual([]);
  // Capture, not bubble: by the bubble phase the clicked node is gone.
  expect(added.every(options => options === true)).toBe(true);
});

/*
  The field is sized to its text, and the text changes when the caret moves.

  Neither measure fired on a block switch: the note is unchanged, and the hook's
  mount measure watches the element, which React reuses across the switch. So
  the field kept the height of the block you came from — a tall empty gap under
  a short paragraph, and, because the field is `overflow-hidden`, a taller block
  clipped to the height of the shorter one it was opened from. That is what made
  a list collapse.
*/
test("the field is re-measured when the caret moves to another block", async () => {
  const heights: Record<string, number> = { "One\ntwo\nthree": 60, "Short.": 20 };
  const scrollHeight = vi
    .spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get")
    .mockImplementation(function (this: HTMLTextAreaElement) {
      return heights[this.value] ?? 0;
    });
  // `fitToText` refuses to trust an unlaid-out field, and jsdom is all zeroes.
  const clientWidth = vi
    .spyOn(HTMLTextAreaElement.prototype, "clientWidth", "get")
    .mockReturnValue(600);

  const surface = mount({ ...note, content: "One\ntwo\nthree\n\nShort." });

  await surface.click(paragraphSaying(surface, "One\ntwo\nthree"));
  expect(surface.field()?.style.height).toBe("60px");

  await surface.click(paragraphSaying(surface, "Short."));
  expect(surface.field()?.value).toBe("Short.");
  expect(surface.field()?.style.height).toBe("20px");

  scrollHeight.mockRestore();
  clientWidth.mockRestore();
});
