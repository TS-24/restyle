/**
 * @vitest-environment jsdom
 *
 * The block under the caret says what it stands for.
 *
 * A note reads as a document and edits as text, one block at a time. Until now
 * the text half was the same plain body type whatever it replaced, so clicking
 * a heading swapped 29px of Playfair for 20px of Garamond and everything below
 * it moved up 9px; clicking a fenced block lost its ground and its monospace
 * and grew 29px doing it. Measured in Chrome, both of them, before the fix.
 *
 * The fix is a declaration, not a measurement: the open field's wrapper carries
 * the kind of block it is standing in for, and `app.css` writes the source's
 * type in the *same rule* as the rendered block's so the two cannot drift.
 * What this file can pin is that declaration. jsdom has no layout — no
 * `getBoundingClientRect`, no cascade worth reading — so the pixels are checked
 * in a real browser and only the contract is checked here.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

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

const TEXT = [
  "# Tides",
  "",
  "The moon pulls the water toward it.",
  "",
  "## What to remember",
  "",
  "- spring tides",
  "- neap tides",
  "",
  "> Twice a day, near enough.",
  "",
  "```python\ndef height(t):\n    return 1\n```",
  "",
  "| Phase | Range |\n| --- | --- |\n| Spring | wide |",
].join("\n");

const noteOf = (content: string): Note => ({
  id: 3,
  title: "Tides",
  content,
  user_id: 1,
  is_pinned: false,
  created_at: NOW,
  updated_at: NOW,
  archived_at: null,
});

let cleanup = () => {};
afterEach(() => cleanup());

function mount(content = TEXT) {
  const container = document.createElement("div");
  document.body.append(container);
  const router = createMemoryRouter(
    [
      {
        path: "/notes",
        action: () => ({ ok: true }),
        Component: () => (
          <NoteSurface
            note={noteOf(content)}
            mode="page"
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

  const rendered = () => container.querySelector("[data-note-body]")!;
  return {
    container,
    rendered,
    /** The wrapper round the open field — what carries the declaration. */
    source: () => container.querySelector("[data-block]"),
    field: () =>
      container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Note text"]'),
    /** Click a rendered block, at a point below the body's own top edge. */
    click: (el: Element) =>
      act(() => {
        el.dispatchEvent(
          new MouseEvent("mousedown", { bubbles: true, button: 0, clientY: 1 }),
        );
      }),
  };
}

describe("the open block declares what it renders as", () => {
  test.each([
    ["h1", "heading"],
    ["p", "paragraph"],
    ["ul", "list"],
    ["blockquote", "blockquote"],
    ["pre", "code"],
    ["table", "table"],
  ])("clicking a %s opens a %s", async (selector, kind) => {
    const surface = mount();

    await surface.click(surface.rendered().querySelector(selector)!);

    expect(surface.source()?.getAttribute("data-block")).toBe(kind);
  });

  test("a heading carries the level it was rendered at", async () => {
    const surface = mount();

    await surface.click(surface.rendered().querySelector("h2")!);

    expect(surface.source()?.getAttribute("data-level")).toBe("2");
    expect(surface.field()?.value).toBe("## What to remember");
  });

  test("nothing but a heading has a level", async () => {
    const surface = mount();

    await surface.click(surface.rendered().querySelector("p")!);

    expect(surface.source()?.hasAttribute("data-level")).toBe(false);
  });

  /**
   * Empty text parses to zero blocks, and the field is then simply the note.
   * Every note this app makes starts that way, which is the seam that once made
   * every one of them untypable — so it gets a fixture of its own here rather
   * than a fixture with text in it, eleven times over.
   */
  test("a note with nothing in it opens as prose", async () => {
    const surface = mount("");

    await surface.click(surface.rendered());

    expect(surface.field()).not.toBeNull();
    expect(surface.source()?.getAttribute("data-block")).toBe("paragraph");
  });

  /**
   * The field carrying its own `font-size` is what stopped `em` in `app.css`
   * from resolving against the body's size — which is the value being tweened
   * across a morph, so an inline size is also a source that does not ride the
   * tween the rendered block rides.
   *
   * The transition went with it, and that one was doing visible harm. Measured
   * in Chrome: the field kept `transition: font-size 550ms` from the morph, so
   * moving the caret from a paragraph into a heading spent 550ms tweening one
   * block's type into another's — under a caret that had already arrived. A
   * mode change is a size change; a block change is not.
   */
  test("the field sets neither a font size nor a transition of its own", async () => {
    const surface = mount();

    await surface.click(surface.rendered().querySelector("h1")!);

    expect(surface.field()!.style.fontSize).toBe("");
    expect(surface.field()!.style.transition).toBe("");
  });
});
