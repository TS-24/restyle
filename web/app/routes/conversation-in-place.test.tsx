/**
 * @vitest-environment jsdom
 *
 * A conversation is not a place of its own. It is the other face of the note.
 *
 * It used to live at `/chats/:id`, outside the workspace layout — which is why
 * leaving one had no animation at all: two whole screens with no element in
 * common, so there was nothing for Framer to move. Inside the layout there is.
 * The conversation takes over the note's own `layoutId` as the note surface
 * stands down, and the two crossfade, the same way a card becomes an open note.
 *
 * jsdom has no layout and Framer's projection is a no-op here, so the identity
 * is what these pin. Whether it *reads* as one movement is a question for a
 * browser.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, expect, test } from "vitest";

import Workspace from "~/routes/workspace";
import { conversationLayoutId } from "~/chat/chat-surface";
import { noteLayoutId } from "~/workspace/note-surface";
import type { Route } from "./+types/workspace";
import type { Chat, Note, User } from "~/lib/types";
import { DEFAULT_THEME } from "~/lib/themes";
import { DEFAULT_ALIGNMENT } from "~/lib/alignment";

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
  Element.prototype.scrollTo = function () {};
  Element.prototype.scrollIntoView = function () {};
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

const user: User = {
  id: 1,
  username: "reader",
  email: "reader@example.com",
  is_superuser: false,
};
const provider = { available: [], configured: [], active: null };
const loaderData = { notes: [note], archived: [], user, chats: [chat], provider };
const rootLoaderData = { theme: DEFAULT_THEME, alignment: DEFAULT_ALIGNMENT };

const params = {};
const props: Route.ComponentProps = {
  loaderData,
  params,
  matches: [
    { id: "root", params, pathname: "/", data: rootLoaderData, loaderData: rootLoaderData, handle: undefined },
    { id: "routes/workspace", params, pathname: "/notes", data: loaderData, loaderData, handle: undefined },
  ],
};

let cleanup = () => {};
afterEach(() => cleanup());

function mount(at: string) {
  const container = document.createElement("div");
  document.body.append(container);
  const router = createMemoryRouter(
    [
      {
        path: "/notes",
        action: () => ({ ok: true }),
        Component: () => <Workspace {...props} />,
      },
    ],
    { initialEntries: [at] },
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
    dialog: () => container.querySelector("[role=dialog]")?.getAttribute("aria-label"),
    container,
  };
}

/**
 * The identity that makes the morph a morph.
 *
 * The conversation borrows the note's `layoutId` rather than carrying one of
 * its own. A second id would be a second element, and two elements do not
 * crossfade into each other — they arrive and depart independently, which is
 * the hard cut this replaces.
 */
test("a conversation is identified by the note it belongs to", () => {
  expect(conversationLayoutId(chat)).toBe(noteLayoutId(1));
});

test("a conversation with no note has no identity to borrow", () => {
  expect(conversationLayoutId({ ...chat, note_id: null })).toBeUndefined();
});

test("the note is what is open without ?chat=", () => {
  expect(mount("/notes?open=1").dialog()).toBe("Edit note: Tides");
});

test("the conversation takes the note's place, rather than sitting beside it", () => {
  const { container, dialog } = mount("/notes?open=1&chat=7");

  expect(dialog()).toBe("Conversation: About the tides");
  expect(container.querySelectorAll("[role=dialog]")).toHaveLength(1);
});

test("closing a conversation lands on its note, not on the library", async () => {
  const { router } = mount("/notes?open=1&chat=7");

  await act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });

  expect(router.state.location.pathname).toBe("/notes");
  expect(router.state.location.search).toBe("?open=1");
});

/** A chat that is not this note's is not this note's business. */
test("a ?chat= that does not belong to the open note is ignored", () => {
  expect(mount("/notes?open=1&chat=999").dialog()).toBe("Edit note: Tides");
});
