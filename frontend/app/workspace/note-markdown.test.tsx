/**
 * @vitest-environment jsdom
 *
 * A note reads as a document and edits as text.
 *
 * Finishing a conversation writes a note with headings in it, and until now
 * those landed as flat lines because the body is an unstyled textarea with no
 * renderer behind it. The body now renders its markdown at rest and hands back
 * the raw text the moment you write in it — one editing surface, not two, so
 * `fitToText`, the word roller and save-on-blur are all unchanged.
 *
 * The caret is the part worth pinning. Clicking rendered markdown has to land
 * you somewhere sensible in the *source*, and mapping a click to a character
 * offset through emphasis and list syntax is not reliable. Mapping it to the
 * block it landed in is: react-markdown gives every node its source line, so a
 * click resolves to the start of that line and no further.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

import NoteSurface from "~/workspace/note-surface";
import { offsetOfLine } from "~/notes/markdown";
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
const TEXT =
  "# What this was about\n\nTides, and the moon.\nTwice a day.\n\n## Topics\n\nspring tides";

const note: Note = {
  id: 3,
  title: "Tides",
  content: TEXT,
  user_id: 1,
  is_pinned: false,
  created_at: NOW,
  updated_at: NOW,
  words: [],
};

let cleanup = () => {};
afterEach(() => cleanup());

function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  const router = createMemoryRouter(
    [
      {
        path: "/notes",
        action: () => ({ ok: true }),
        Component: () => (
          <NoteSurface
            note={note}
            mode="boxed"
            conversationId={null}
            onOpen={() => {}}
            onClose={() => {}}
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
  return {
    container,
    rendered: () => container.querySelector("[data-note-body]"),
    field: () =>
      container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Note text"]'),
    click: (el: Element) =>
      act(() => {
        el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      }),
  };
}

describe("offsetOfLine", () => {
  test("the first line starts at nothing", () => {
    expect(offsetOfLine(TEXT, 1)).toBe(0);
  });

  test("a later line starts past every line before it", () => {
    // Line 3 is "Tides, and the moon." — after the heading and the blank line.
    expect(TEXT.slice(offsetOfLine(TEXT, 3))).toMatch(/^Tides, and the moon\./);
  });

  test("a line past the end lands at the end", () => {
    expect(offsetOfLine(TEXT, 99)).toBe(TEXT.length);
  });
});

test("the note's markdown is rendered at rest", () => {
  const surface = mount();

  expect(surface.rendered()?.querySelector("h1")?.textContent).toBe(
    "What this was about",
  );
  expect(surface.rendered()?.querySelector("h2")?.textContent).toBe("Topics");
  expect(surface.field()).toBeNull();
});

test("writing in it gives back the text you wrote", async () => {
  const surface = mount();

  await surface.click(surface.rendered()!.querySelector("h1")!);

  expect(surface.field()?.value).toBe(TEXT);
});

test("the caret lands in the block you clicked", async () => {
  const surface = mount();

  await surface.click(surface.rendered()!.querySelector("h2")!);

  const field = surface.field()!;
  expect(field.value.slice(field.selectionStart)).toMatch(/^## Topics/);
});

/**
 * Markdown reads a single newline as a space, and these notes are plain text
 * first: most are lines somebody typed. Running them together would be the
 * renderer quietly rewriting what was written.
 */
test("the line breaks in a plain note survive being rendered", () => {
  const surface = mount();
  const lines = surface
    .rendered()!
    .querySelectorAll("br").length;

  expect(lines).toBeGreaterThan(0);
});

test("a note with no markdown in it reads exactly as it is written", () => {
  const surface = mount();

  expect(surface.rendered()?.textContent).toContain("Tides, and the moon.");
});
