/**
 * @vitest-environment jsdom
 *
 * The note a conversation was started from is not a turn somebody took.
 *
 * It is stored as a `system` message so the provider and the summariser both
 * see it, but rendering it in the transcript would show the reader their own
 * note pasted back at them as the thing they opened with — and a long note
 * would fill the conversation before it began. It is shown as what it is: where
 * this started, with a way back to it.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, expect, test } from "vitest";

import ChatSurface from "~/chat/chat-surface";
import type { Chat, ProviderSettings } from "~/lib/types";

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
const SEED = "The reader started this conversation from a note of theirs:\n\nTides";

const seeded: Chat = {
  id: 7,
  user_id: 1,
  title: "Tides",
  note_id: 3,
  created_at: NOW,
  updated_at: NOW,
  messages: [
    { id: 1, role: "system", content: SEED, created_at: NOW },
    { id: 2, role: "user", content: "what makes a spring tide", created_at: NOW },
    { id: 3, role: "assistant", content: "Sun and moon in line.", created_at: NOW },
  ],
  summary: null,
};

const provider: ProviderSettings = { available: [], configured: [], active: null };

let cleanup = () => {};
afterEach(() => cleanup());

function mount(chat: Chat) {
  const container = document.createElement("div");
  document.body.append(container);
  const router = createMemoryRouter(
    [
      {
        path: "/chats/:chatId",
        action: () => ({ ok: true }),
        Component: () => (
          <ChatSurface chat={chat} provider={provider} mode="page" onClose={() => {}} />
        ),
      },
      { path: "/notes", Component: () => <p>the library</p> },
    ],
    { initialEntries: ["/chats/7"] },
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

test("the seeded note is not one of the turns", () => {
  const container = mount(seeded);

  const spoken = [...container.querySelectorAll("[data-slot=bubble]")].map(
    b => b.textContent,
  );

  expect(spoken).toHaveLength(2);
  expect(spoken.join(" ")).not.toContain(SEED);
});

test("it says where the conversation started, with a way back", () => {
  const container = mount(seeded);

  const back = container.querySelector<HTMLAnchorElement>('a[href="/notes?open=3"]');

  expect(back).not.toBeNull();
  expect(container.textContent).toContain("Started from");
});

/** A conversation begun from the library has no seed and claims none. */
test("a conversation begun from nothing says nothing about a note", () => {
  const container = mount({ ...seeded, messages: seeded.messages.slice(1) });

  expect(container.textContent).not.toContain("Started from");
});
