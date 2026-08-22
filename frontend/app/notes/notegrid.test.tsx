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
import { chatLayoutId } from "~/chat/chat-surface";
import type { Chat, Note } from "~/lib/types";

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
  words: [],
});

const chat = (id: number, title: string, noteId: number | null = 100 + id): Chat => ({
  id,
  user_id: 1,
  title,
  note_id: noteId,
  messages: [],
  summary: null,
  created_at: NOW,
  updated_at: NOW,
});

let cleanup = () => {};
afterEach(() => cleanup());

function mount(notes: Note[], chats: Chat[]) {
  const container = document.createElement("div");
  document.body.append(container);
  const router = createMemoryRouter(
    [
      {
        path: "/notes",
        action: () => ({ ok: true }),
        Component: () => <Notegrid notes={notes} chats={chats} />,
      },
      { path: "/chats/:chatId", Component: () => <div /> },
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
  const { router, container } = mount([note(7, "First")], []);
  const card = container.querySelector("[data-note-card]");
  expect(card).not.toBeNull();

  await act(async () => {
    click(card!, 1);
  });

  expect(router.state.location.pathname).toBe("/notes");
  expect(router.state.location.search).toBe("?open=7");
});

/**
 * A chat opens exactly as a note does: one click, and it expands where it sits.
 *
 * Sending the click to `/chats/:id` instead left the layout route, so there was
 * no surface on the far side for the card's `layoutId` to hand its measurements
 * to — the grid was replaced wholesale and the card appeared to jump to another
 * screen. Staying on `/notes` is what makes it a morph rather than a swap.
 */
test("a single click on a chat card opens it in the library", async () => {
  const { router, container } = mount([], [chat(4, "A conversation")]);
  const card = container.querySelector("[data-note-card]");
  expect(card).not.toBeNull();

  await act(async () => {
    click(card!, 1);
  });

  expect(router.state.location.pathname).toBe("/notes");
  expect(router.state.location.search).toBe("?chat=4");
});

/** The card hands its box to the surface; without a shared id there is no morph. */
test("a chat card and the chat surface share one layout id", () => {
  expect(chatLayoutId(4)).toBe("chat-4");
});

/**
 * A summarised conversation is shown as the note it produced, not as a second
 * card saying the same thing. Chats summarised before that existed have no note
 * to show instead, so they keep their card — hence the test is on `note_id`,
 * not on `summary`.
 */
/**
 * Every conversation is bound to a note from the moment it exists, so having
 * one is no longer what says a chat is done. An unfinished chat's note is
 * empty; it is the conversation you want to see, not the blank page behind it.
 */
test("a live conversation keeps its card even though it has a note", () => {
  const { container } = mount([], [chat(6, "Still going", 106)]);
  const titles = [...container.querySelectorAll("h3")].map(h => h.textContent);

  expect(titles).toContain("Still going");
});

test("a chat that became a note leaves the grid", () => {
  const became = {
    ...chat(4, "Finished", 12),
    summary: {
      general: "g",
      topics: [],
      questions: "q",
      answers: "a",
      summarized_at: NOW,
      note_id: 12,
    },
  } as Chat;
  const older = {
    ...chat(5, "Older", null),
    summary: {
      general: "g",
      topics: [],
      questions: "q",
      answers: "a",
      summarized_at: NOW,
      note_id: null,
    },
  } as Chat;

  const { container } = mount([], [became, older]);
  const titles = [...container.querySelectorAll("h3")].map(h => h.textContent);

  expect(titles).not.toContain("Finished");
  expect(titles).toContain("Older");
});
