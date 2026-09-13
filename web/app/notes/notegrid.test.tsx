/**
 * @vitest-environment jsdom
 *
 * jsdom per file, matching workspace.test.tsx — the suite's default is node.
 *
 * These pin the *gestures*, which is all jsdom can speak to: it has no layout,
 * so nothing here says anything about where a card sits or how it animates.
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

const note = (id: number, title: string): Note => ({
  id,
  title,
  content: `The text of ${title}.`,
  user_id: 1,
  is_pinned: false,
  created_at: NOW,
  updated_at: NOW,
  archived_at: null,
});

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
        Component: () => <Notegrid notes={notes} />,
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
  return { router, container };
}

const click = (el: Element, detail: number) =>
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, detail }));

/**
 * A card renders `cursor: pointer` but only carried `onDoubleClick`, so a
 * single click — what the cursor promises — did nothing at all.
 */
test("a single click on a note card opens it", async () => {
  const { router, container } = mount([note(7, "First")]);
  const card = container.querySelector("[data-note-card]");
  expect(card).not.toBeNull();

  await act(async () => {
    click(card!, 1);
  });

  expect(router.state.location.pathname).toBe("/notes");
  expect(router.state.location.search).toBe("?open=7");
});

/*
  The four tests that stood here were about conversation cards: that one click
  opened a chat in the library, that its card and the chat surface shared a
  layout id, and which chats appeared in the grid at all.

  There are no conversation cards. The library is a list of notes, and every
  conversation has a note that stands for it — so a chat has one way in, through
  the note it belongs to, rather than two that could disagree. What replaces
  them is `library-is-notes.test.tsx` and `conversation-in-place.test.tsx`,
  which pin the grid's contents and the identity the conversation borrows from
  its note.
*/
