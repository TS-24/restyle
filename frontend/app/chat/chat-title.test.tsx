/**
 * @vitest-environment jsdom
 *
 * A conversation's name is a guess, so it has to be correctable.
 *
 * `crud/chat.py::title_from` takes it from the first thing said, which is
 * whatever you happened to open with — and that name is the whole of what
 * stands for the conversation in the library. The note beside it has had an
 * editable title all along; this one was an `<h1>`.
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
  title: "what makes a spring tide",
  created_at: NOW,
  updated_at: NOW,
  messages: [],
  summary: null,
};

const provider: ProviderSettings = { available: [], configured: [], active: null };

let cleanup = () => {};
afterEach(() => cleanup());

function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  const renames: Array<Record<string, string>> = [];

  const router = createMemoryRouter(
    [
      {
        path: "/chats/:chatId",
        action: () => ({ ok: true }),
        Component: () => (
          <ChatSurface chat={chat} provider={provider} mode="page" onClose={() => {}} />
        ),
      },
      {
        path: "/chats",
        action: async ({ request }) => {
          const form = await request.formData();
          renames.push(Object.fromEntries(form) as Record<string, string>);
          return { ok: true };
        },
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

  const field = () =>
    container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Conversation title"]')!;

  return {
    container,
    renames,
    field,
    type: (text: string) =>
      act(() => {
        const el = field();
        Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        )!.set!.call(el, text);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }),
    leave: async () => {
      await act(async () => {
        // React maps `onBlur` onto the native focusout, which bubbles; a plain
        // "blur" event never reaches it.
        field().dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 0));
      });
    },
  };
}

test("the title is a field, holding the conversation's name", () => {
  const surface = mount();

  expect(surface.field().value).toBe("what makes a spring tide");
});

test("leaving the field saves the new name", async () => {
  const surface = mount();

  await surface.type("Spring tides");
  await surface.leave();

  expect(surface.renames).toEqual([
    { intent: "rename", id: "7", title: "Spring tides" },
  ]);
});

/** Nothing changed is nothing to send — the same guard the note's save has. */
test("leaving an untouched title saves nothing", async () => {
  const surface = mount();

  await surface.leave();

  expect(surface.renames).toEqual([]);
});

/** The API refuses an empty title, and the field lets you clear it. */
test("a cleared title falls back rather than being sent empty", async () => {
  const surface = mount();

  await surface.type("   ");
  await surface.leave();

  expect(surface.renames).toEqual([{ intent: "rename", id: "7", title: "Untitled" }]);
});
