/**
 * @vitest-environment jsdom
 *
 * Closing a boxed conversation has to be one movement, not two.
 *
 * The note surface puts the shared `CHROME_TRANSITION` in its inline style, so
 * padding, background and shadow tween over exactly the window Framer's layout
 * projection takes to move the box. The chat surface had a plain style object
 * with no transition at all — so its geometry glided and its chrome snapped,
 * open to closed in a single frame, which is the jump you see.
 *
 * jsdom runs no animations and Framer's projection is a no-op here, so what is
 * pinned is that the two surfaces are driven by the same constant. Two literals
 * would drift, and a chrome transition outlasting its tween is the box arriving
 * before the paper it is made of.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, expect, test } from "vitest";

import ChatSurface from "~/chat/chat-surface";
import { CHROME_TRANSITION } from "~/workspace/note-surface";
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

const chat: Chat = {
  id: 7,
  user_id: 1,
  title: "About the tides",
  created_at: NOW,
  updated_at: NOW,
  messages: [],
  summary: null,
};

const provider: ProviderSettings = { available: [], configured: [], active: null };

let cleanup = () => {};
afterEach(() => cleanup());

function mount(mode: "page" | "boxed") {
  const container = document.createElement("div");
  document.body.append(container);
  const router = createMemoryRouter(
    [
      {
        path: "/chats/:chatId",
        action: () => ({ ok: true }),
        Component: () => (
          <ChatSurface chat={chat} provider={provider} mode={mode} onClose={() => {}} />
        ),
      },
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
  return container.querySelector<HTMLElement>("[role=dialog]")!;
}

test("the boxed conversation tweens its chrome over the note's window", () => {
  expect(mount("boxed").style.transition).toBe(CHROME_TRANSITION);
});

test("so does the conversation on its own page", () => {
  expect(mount("page").style.transition).toBe(CHROME_TRANSITION);
});
