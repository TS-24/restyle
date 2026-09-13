/**
 * @vitest-environment jsdom
 *
 * The two bits of markdown that are not type: a box you tick, and a place to
 * go.
 *
 * `remark-gfm` is carried on the landing page's critical path — markdown.tsx
 * prices it at ~10kB — and kept, in its own words, "because dropping it loses
 * tables, task lists and strikethrough". It was rendering the task list
 * `disabled`: a checkbox drawn in a note you could not tick, which is the
 * feature paid for and not delivered.
 *
 * A link was worse than dead. With no `target` it took the whole app with it,
 * so following a reference out of a note lost the note.
 *
 * Both are the reader's source, so both are written back into it: ticking a box
 * rewrites `[ ]` to `[x]` on that line. Which line comes from the same
 * `data-line` a click into rendered markdown already uses, so there is one
 * answer to "where in the source is this" and not two.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, expect, test } from "vitest";

import Markdown from "~/notes/markdown";
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
  "# Before the tide",
  "",
  "- [ ] Check the harbour chart",
  "- [x] Read the almanac",
  "",
  "See [NOAA](https://tidesandcurrents.noaa.gov) for the numbers.",
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

function render(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(element));
  cleanup = () => {
    act(() => root.unmount());
    container.remove();
  };
  return container;
}

function mount(content = TEXT) {
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
  const container = render(<RouterProvider router={router} />);
  const body = () => container.querySelector("[data-note-body]")!;
  return {
    container,
    body,
    boxes: () => [...body().querySelectorAll<HTMLInputElement>('input[type="checkbox"]')],
    field: () =>
      container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Note text"]'),
    /** Open a block by clicking it, so its raw source can be read back. */
    open: (el: Element) =>
      act(() => {
        el.dispatchEvent(
          new MouseEvent("mousedown", { bubbles: true, button: 0, clientY: 1 }),
        );
      }),
  };
}

test("a note's task boxes are live", () => {
  const surface = mount();

  expect(surface.boxes().map(box => box.disabled)).toEqual([false, false]);
});

test("ticking a box writes it into the source", async () => {
  const surface = mount();

  await act(async () => surface.boxes()[0].click());

  expect(surface.boxes()[0].checked).toBe(true);
  // Not merely the DOM's own toggle: the text behind it has to have changed,
  // or the tick is gone the moment anything re-renders.
  await surface.open(surface.body().querySelector("li")!);
  expect(surface.field()?.value).toBe(
    "- [x] Check the harbour chart\n- [x] Read the almanac",
  );
});

test("un-ticking one puts the space back", async () => {
  const surface = mount();

  await act(async () => surface.boxes()[1].click());

  await surface.open(surface.body().querySelector("li")!);
  expect(surface.field()?.value).toBe(
    "- [ ] Check the harbour chart\n- [ ] Read the almanac",
  );
});

/**
 * The rendered halves above and below an open block are markdown documents of
 * their own, so remark numbers their lines from 1 again. A box in the lower
 * half has to resolve through `data-line-base` like everything else, or ticking
 * one near the bottom of a note rewrites a line near the top.
 */
test("a box below the open block still finds its own line", async () => {
  const surface = mount();
  await surface.open(surface.body().querySelector("h1")!);

  await act(async () => surface.boxes()[0].click());

  await surface.open(surface.body().querySelector("li")!);
  expect(surface.field()?.value).toBe(
    "- [x] Check the harbour chart\n- [x] Read the almanac",
  );
});

test("a link opens beside the note rather than over it", () => {
  const container = render(<Markdown>{TEXT}</Markdown>);
  const link = container.querySelector("a")!;

  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toContain("noreferrer");
});

/**
 * A card is a glance at a note, not the note. It renders the same `<Markdown>`
 * and has nowhere to write a tick back to, so its boxes stay exactly as they
 * were — the prop is what turns them on, and the grid does not pass one.
 */
test("a card's boxes stay inert", () => {
  const container = render(<Markdown>{TEXT}</Markdown>);

  const boxes = [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  expect(boxes).toHaveLength(2);
  expect(boxes.map(box => box.disabled)).toEqual([true, true]);
});
