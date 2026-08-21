/**
 * @vitest-environment jsdom
 *
 * The two speakers must not share a treatment.
 *
 * The assistant's replies rendered as `variant="ghost"` — transparent, no
 * padding — which is to say as unstyled prose lying directly on the page,
 * while the reader's own turns got the one filled box on screen. So the only
 * thing marked out was the half you already wrote.
 *
 * jsdom has no stylesheet, so what is pinned is that the two are given
 * different treatments and that the assistant's is the one carrying a ground.
 * Which ground it is belongs to `app/themes.css` and to the eye.
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

const chat: Chat = {
  id: 7,
  user_id: 1,
  title: "About the tides",
  created_at: NOW,
  updated_at: NOW,
  messages: [
    { id: 1, role: "user", content: "what makes a spring tide", created_at: NOW },
    { id: 2, role: "assistant", content: "Sun and moon in line.", created_at: NOW },
  ],
  summary: null,
};

const provider: ProviderSettings = { available: [], configured: [], active: null };

let cleanup = () => {};
afterEach(() => cleanup());

function mount() {
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

/** In transcript order: the reader asked, the assistant answered. */
function bubbles(container: HTMLElement) {
  const found = [...container.querySelectorAll("[data-slot=bubble]")];
  expect(found).toHaveLength(2);
  return { reader: found[0], assistant: found[1] };
}

test("the two speakers are given different treatments", () => {
  const { reader, assistant } = bubbles(mount());

  expect(assistant.getAttribute("data-variant")).not.toBe(
    reader.getAttribute("data-variant"),
  );
});

test("the assistant's reply is the one carrying a ground", () => {
  const { reader, assistant } = bubbles(mount());

  // "ghost" is the transparent, unpadded treatment: prose on the page itself.
  expect(assistant.getAttribute("data-variant")).not.toBe("ghost");
  expect(reader.getAttribute("data-variant")).toBe("ghost");
});
