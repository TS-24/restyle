/**
 * @vitest-environment jsdom
 *
 * Per file, matching workspace.test.tsx: the suite's default node environment
 * is left alone for the tests that want no DOM at all.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, expect, test, vi } from "vitest";

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
  // The transcript scroller drives these; jsdom has neither.
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

const provider: ProviderSettings = {
  available: [],
  configured: [],
  active: { provider: "anthropic", model: "claude-opus-5" },
};

let cleanup = () => {};
afterEach(() => cleanup());

/**
 * Mounts the surface over an action we control, so a send can be held open —
 * which is the state every test here is about.
 */
function mount(options: { hold?: boolean; fail?: boolean } = {}) {
  const container = document.createElement("div");
  document.body.append(container);

  const sent: string[] = [];
  let release = () => {};
  const held = new Promise<void>(resolve => {
    release = resolve;
  });

  const router = createMemoryRouter(
    [
      {
        path: "/chats/:chatId",
        action: async ({ request }) => {
          const form = await request.formData();
          sent.push(String(form.get("content") ?? ""));
          if (options.hold) await held;
          if (options.fail) return { ok: false, error: "The provider refused." };
          return {
            ok: true,
            chat: {
              ...chat,
              messages: sent.flatMap((content, i) => [
                { id: i * 2 + 1, role: "user" as const, content, created_at: NOW },
                { id: i * 2 + 2, role: "assistant" as const, content: "Mm.", created_at: NOW },
              ]),
            },
          };
        },
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
    release();
    act(() => root.unmount());
    container.remove();
  };

  const field = () =>
    container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Your message"]')!;

  return {
    container,
    sent,
    release: () => release(),
    field,
    type: (text: string) =>
      act(() => {
        const el = field();
        // React tracks the value on the node; bypass that so `onChange` fires.
        Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        )!.set!.call(el, text);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }),
    enter: () =>
      act(() => {
        field().dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
      }),
  };
}

/**
 * The composer must not gray out while the model is answering.
 *
 * `disabled={pending}` locked the field for the whole of a turn, which is
 * exactly the stretch where you have the next thing to say.
 */
test("the composer stays writable while a reply is in flight", async () => {
  const surface = mount({ hold: true });

  await surface.type("what makes a spring tide");
  await surface.enter();

  expect(surface.field().disabled).toBe(false);
  expect(surface.sent).toEqual(["what makes a spring tide"]);
});

/** Sending clears the field, so the next thing can be typed into it at once. */
test("sending clears the composer", async () => {
  const surface = mount({ hold: true });

  await surface.type("what makes a spring tide");
  await surface.enter();

  expect(surface.field().value).toBe("");
});

/**
 * A message written during a turn is not thrown away and not raced: it waits
 * for the turn in front of it, then goes on its own.
 */
test("a message sent during a turn is queued, then sent when it lands", async () => {
  const surface = mount({ hold: true });

  await surface.type("first");
  await surface.enter();
  await surface.type("second");
  await surface.enter();

  expect(surface.sent).toEqual(["first"]);
  expect(surface.container.textContent).toContain("queued");

  await act(async () => {
    surface.release();
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  expect(surface.sent).toEqual(["first", "second"]);
});

/** Only one waits. A backlog you cannot see or edit is worse than a full field. */
test("a second queued message leaves the composer alone", async () => {
  const surface = mount({ hold: true });

  await surface.type("first");
  await surface.enter();
  await surface.type("second");
  await surface.enter();
  await surface.type("third");
  await surface.enter();

  expect(surface.field().value).toBe("third");
  expect(surface.sent).toEqual(["first"]);
});

/**
 * When a turn fails the unsent words go back to the one place you can edit and
 * resend them, rather than being lost to a provider having a bad minute.
 */
test("a failed turn puts its text back in the composer", async () => {
  const surface = mount({ fail: true });

  await surface.type("what makes a spring tide");
  await surface.enter();
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  expect(surface.field().value).toBe("what makes a spring tide");
});

/**
 * The composer grows with what is in it, up to a ceiling, and scrolls inside
 * itself past that. jsdom reports `scrollHeight` 0, so the text height is
 * faked; what is pinned is that the field is sized from it at all.
 */
test("the composer sizes itself to its text", async () => {
  const surface = mount();
  const el = surface.field();
  Object.defineProperty(el, "scrollHeight", { value: 214, configurable: true });
  Object.defineProperty(el, "clientWidth", { value: 640, configurable: true });

  await surface.type("a\nb\nc\nd\ne");

  expect(el.style.height).toBe("214px");
  expect(el.style.maxHeight).not.toBe("");
  expect(el.style.overflowY).toBe("auto");
});
