/**
 * @vitest-environment jsdom
 *
 * Finishing is a checkpoint, not a door.
 *
 * The backend used to refuse a turn in a summarised chat with a 409, and the
 * surface matched it by taking the composer away. It does not refuse any more:
 * saying something else picks the conversation up again and clears the summary,
 * because a summary describes a finished conversation and that one is not
 * finished. The note keeps what the last finish wrote until the next one.
 *
 * So the composer stays. A conversation you cannot add to is one you have to
 * start again from a new note, which is the opposite of accumulating.
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

const finished: Chat = {
  id: 7,
  user_id: 1,
  title: "About the tides",
  note_id: 3,
  created_at: NOW,
  updated_at: NOW,
  messages: [
    { id: 1, role: "user", content: "what makes a spring tide", created_at: NOW },
    { id: 2, role: "assistant", content: "Sun and moon in line.", created_at: NOW },
  ],
  summary: {
    notes: "A spring tide happens when the sun and moon line up.",
    actions: [],
    summarized_at: NOW,
    note_id: 3,
  },
};

const provider: ProviderSettings = { available: [], configured: [], active: null };

let cleanup = () => {};
afterEach(() => cleanup());

function mount(chat: Chat) {
  const container = document.createElement("div");
  document.body.append(container);
  const sent: string[] = [];
  const router = createMemoryRouter(
    [
      {
        path: "/chats/:chatId",
        action: async ({ request }) => {
          const form = await request.formData();
          sent.push(String(form.get("content") ?? form.get("intent")));
          return { ok: true, chat };
        },
        Component: () => (
          <ChatSurface chat={chat} provider={provider} onClose={() => {}} />
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
  const field = () =>
    container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Your message"]');
  return {
    container,
    sent,
    field,
    say: async (text: string) => {
      await act(async () => {
        const el = field()!;
        Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        )!.set!.call(el, text);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => {
        field()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 0));
      });
    },
  };
}

test("a finished conversation still has a composer", () => {
  expect(mount(finished).field()).not.toBeNull();
});

test("you can say something else in one", async () => {
  const surface = mount(finished);

  await surface.say("one more thing");

  expect(surface.sent).toEqual(["one more thing"]);
});

test("it says where the summary went, rather than that it is closed", () => {
  const { container } = mount(finished);

  expect(container.textContent).not.toContain("This conversation is finished");
  expect(container.querySelector('a[href="/notes?open=3"]')).not.toBeNull();
});
