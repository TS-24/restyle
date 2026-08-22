/**
 * @vitest-environment jsdom
 *
 * A card is a glance at the note, so it has to glance at the note and not at
 * its syntax. A note written by a finished conversation is headings and
 * paragraphs; a card showing its `##` shows the machinery instead.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, expect, test } from "vitest";

import Notegrid from "~/notes/notegrid";
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

const summarised: Note = {
  id: 1,
  title: "Tides",
  content: "## What this was about\n\nTides, and the moon.",
  user_id: 1,
  is_pinned: false,
  created_at: NOW,
  updated_at: NOW,
  words: [],
};

let cleanup = () => {};
afterEach(() => cleanup());

function mount(notes: Note[]) {
  const container = document.createElement("div");
  document.body.append(container);
  const router = createMemoryRouter(
    [
      {
        path: "/notes",
        action: () => ({ ok: true }),
        Component: () => <Notegrid notes={notes} chats={[]} />,
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

test("a card renders the note's markdown rather than its syntax", () => {
  const container = mount([summarised]);
  const preview = container.querySelector(".note-preview")!;

  expect(preview.querySelector("h2")?.textContent).toBe("What this was about");
  expect(preview.textContent).not.toContain("##");
});

test("a note with nothing in it renders nothing rather than breaking", () => {
  const container = mount([{ ...summarised, content: null }]);

  expect(container.querySelector(".note-preview")?.textContent).toBe("");
});
