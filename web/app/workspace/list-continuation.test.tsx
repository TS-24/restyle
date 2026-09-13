/**
 * @vitest-environment jsdom
 *
 * Enter carries a list forward.
 *
 * The body is a writing surface, so Enter there is a newline and not a commit —
 * `handleKeyDown` steps out of the way for exactly that reason. A newline is
 * the right answer everywhere except inside a list, where it leaves the reader
 * to type `- ` again for every item, and where forgetting to makes the line a
 * lazy continuation of the item above it instead of an item of its own. The
 * note renders live, so that mistake is visible immediately and still has to be
 * undone by hand.
 *
 * This is the one arm of `handleBlockKeys` that is not an edge crossing. It
 * goes through `settleAt` like the crossings do, so the caret follows itself
 * into whatever the new text parses to and there is no second piece of caret
 * machinery to keep in step.
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

function mount(content: string) {
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

  const body = () => container.querySelector("[data-note-body]")!;
  const field = () =>
    container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Note text"]')!;

  return {
    field,
    /**
     * Open the block holding `source`, caret parked just after it.
     *
     * `look` is the same line as it reads once rendered — the marker and the
     * task box are syntax and are not in the DOM to be found by.
     */
    at: async (source: string, look: string) => {
      const line = [...body().querySelectorAll("[data-line]")].find(el =>
        el.textContent?.includes(look),
      );
      await act(async () => {
        line!.dispatchEvent(
          new MouseEvent("mousedown", { bubbles: true, button: 0, clientY: 1 }),
        );
      });
      // The last occurrence, so a bare trailing `- ` is not mistaken for the
      // marker of the first item.
      const caret = field().value.lastIndexOf(source) + source.length;
      await act(async () => field().setSelectionRange(caret, caret));
    },
    /** Returns the event, so a fall-through can be told from a handled key. */
    enter: async () => {
      const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
      await act(async () => {
        field().dispatchEvent(event);
      });
      return event;
    },
  };
}

describe("Enter inside a list", () => {
  test("repeats the bullet", async () => {
    const surface = mount("- milk\n- bread");

    await surface.at("- milk", "milk");
    await surface.enter();

    expect(surface.field().value).toBe("- milk\n- \n- bread");
    expect(surface.field().selectionStart).toBe(9);
  });

  test("counts an ordered list on", async () => {
    const surface = mount("1. one\n2. two");

    await surface.at("1. one", "one");
    await surface.enter();

    expect(surface.field().value).toBe("1. one\n2. \n2. two");
  });

  test("keeps a nested item's indent", async () => {
    const surface = mount("- outer\n  - inner");

    await surface.at("  - inner", "inner");
    await surface.enter();

    expect(surface.field().value).toBe("- outer\n  - inner\n  - ");
  });

  /** A new task starts undone. Repeating the tick would be repeating the wrong half. */
  test("a task box comes back empty", async () => {
    const surface = mount("- [x] read the almanac\n- [ ] check the chart");

    await surface.at("- [x] read the almanac", "read the almanac");
    await surface.enter();

    expect(surface.field().value).toBe(
      "- [x] read the almanac\n- [ ] \n- [ ] check the chart",
    );
  });

  /**
   * The way out. Pressing Enter on an item you have not written in means you
   * are done with the list, which is what GitHub and Obsidian both do with it.
   */
  test("an item with nothing in it drops its marker", async () => {
    const surface = mount("- milk\n- ");

    await surface.at("- ", "milk");
    await surface.enter();

    expect(surface.field().value).toBe("- milk\n");
    expect(surface.field().selectionStart).toBe(7);
  });

  test("a line carrying no marker is left to the browser", async () => {
    // The second line of an item, wrapped by hand. There is no marker to
    // repeat, so Enter means what it means everywhere else in the body.
    const surface = mount("- a long item\n  carried on");

    await surface.at("  carried on", "carried on");
    const event = await surface.enter();

    expect(event.defaultPrevented).toBe(false);
  });
});

test("Enter in a paragraph is still just a newline", async () => {
  const surface = mount("The moon pulls the water toward it.");

  await surface.at("water", "water");
  const event = await surface.enter();

  expect(event.defaultPrevented).toBe(false);
  expect(surface.field().value).toBe("The moon pulls the water toward it.");
});
