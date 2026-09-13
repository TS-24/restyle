/**
 * @vitest-environment jsdom
 *
 * The library is a list of notes.
 *
 * Conversations used to have cards of their own beside them, which made the
 * grid two kinds of thing and gave a chat two ways in — its card, and the note
 * it was bound to. Now every conversation has a note and the note is what
 * stands in the grid; the conversation is reached by opening that note and
 * asking for it.
 *
 * "New AI chat" stays. It is a way of *starting* something, not a second way of
 * reaching it: it makes a note and drops you into its conversation.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, expect, test } from "vitest";

import Notegrid from "~/notes/notegrid";
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

const note: Note = {
  id: 1,
  title: "Tides",
  content: "The moon pulls.",
  user_id: 1,
  is_pinned: false,
  created_at: NOW,
  updated_at: NOW,
  archived_at: null,
};

const chat: Chat = {
  id: 7,
  user_id: 1,
  title: "About the tides",
  note_id: 1,
  created_at: NOW,
  updated_at: NOW,
  messages: [],
  summary: null,
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
        Component: () => <Notegrid notes={[note]} />,
      },
      { path: "/chats", action: () => ({ ok: true, id: 7, noteId: 1 }) },
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
    router,
    container,
    ghost: (label: string) =>
      [...container.querySelectorAll("button, [role=button]")].find(
        el => el.getAttribute("aria-label") === label || el.getAttribute("title") === label,
      )!,
  };
}

/*
  The grid cannot be handed conversations any more — the prop is gone, and tsc
  says so. What is still worth a test is that nothing puts them back: this
  passes a library holding one note and one conversation bound to it, and the
  grid shows the note, once.
*/
test("the grid holds notes and nothing else", () => {
  const { container } = mount();
  const titles = [...container.querySelectorAll("h3")].map(h => h.textContent);

  expect(titles).toEqual(["Tides"]);
  expect(container.textContent).not.toContain("Conversation");
  expect(container.textContent).not.toContain(chat.title);
});

test("starting a conversation opens it over its own note", async () => {
  const surface = mount();

  await act(async () => {
    (surface.ghost("New AI chat") as HTMLElement).click();
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  expect(surface.router.state.location.search).toBe("?open=1&chat=7");
});
