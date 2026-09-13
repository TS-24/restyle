/**
 * @vitest-environment jsdom
 *
 * The title and the body sit in the same box.
 *
 * jsdom has no layout, so this cannot measure anything — what it pins is that
 * the two rows are constrained by the *same* rule, which is the property that
 * actually broke. The title took the full column while the body sat in a
 * narrower box centred inside it. Centred text hid it completely, since both
 * were centred on the same axis; aligning the note flush left put 94px between
 * two edges that are read as one.
 *
 * A real width check needs a browser. This is the cheap half: if someone gives
 * one of them its own measure again, the classes stop matching here first.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, expect, test } from "vitest";

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

const note: Note = {
  id: 3,
  title: "Tides",
  content: "Twice a day.",
  user_id: 1,
  is_pinned: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  archived_at: null,
};

let cleanup = () => {};
afterEach(() => cleanup());

function mount(mode: "boxed" | "page") {
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
            mode={mode}
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
  return container;
}

/** The width rules on an element, in a stable order, ignoring everything else. */
function measureOf(el: Element | null | undefined): string[] {
  return (el?.className ?? "")
    .split(/\s+/)
    .filter((c) => c === "mx-auto" || c.startsWith("max-w-") || c === "w-full")
    .sort();
}

test.each(["boxed", "page"] as const)(
  "the title and the body share one measure in %s mode",
  (mode) => {
    const container = mount(mode);
    const title = container.querySelector('textarea[aria-label="Note title"]');
    const body = container.querySelector("[data-note-body]");

    expect(title).not.toBeNull();
    expect(body).not.toBeNull();

    const titleMeasure = measureOf(title!.parentElement);
    expect(titleMeasure).not.toEqual([]);
    expect(measureOf(body!.parentElement)).toEqual(titleMeasure);
  },
);

test("the column itself is what changes width between the modes", () => {
  // The measure is a cap the column can be narrower than; the column is the
  // thing that differs by mode. If the measure started varying too, the note
  // would change width for two reasons at once.
  const boxed = mount("boxed");
  const boxedMeasure = measureOf(
    boxed.querySelector('textarea[aria-label="Note title"]')!.parentElement,
  );
  cleanup();

  const page = mount("page");
  const pageMeasure = measureOf(
    page.querySelector('textarea[aria-label="Note title"]')!.parentElement,
  );

  expect(pageMeasure).toEqual(boxedMeasure);
});
