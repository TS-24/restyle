/**
 * @vitest-environment jsdom
 *
 * The "btw" panel: a question asked beside the conversation, kept out of it.
 *
 * What is checked here is mostly what does *not* happen. The transcript is
 * what gets summarised into the note, so an aside reaching it would put a
 * passing question into the record of what the conversation was about — which
 * is the one thing this feature exists to prevent.
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
  note_id: 3,
  created_at: NOW,
  updated_at: NOW,
  messages: [
    { id: 1, role: "user", content: "what makes a spring tide", created_at: NOW },
    { id: 2, role: "assistant", content: "The sun and moon in line.", created_at: NOW },
  ],
  summary: null,
};

const provider: ProviderSettings = {
  available: [],
  configured: [],
  active: { provider: "anthropic", model: "claude-opus-5" },
};

let cleanup = () => {};
afterEach(() => cleanup());

function mount() {
  const container = document.createElement("div");
  document.body.append(container);

  /** Every submission the route saw, so a test can read the intent it carried. */
  const posts: Record<string, string>[] = [];

  const router = createMemoryRouter(
    [
      {
        path: "/chats/:chatId",
        action: async ({ request }) => {
          const form = await request.formData();
          const post = Object.fromEntries(
            [...form.entries()].map(([k, v]) => [k, String(v)]),
          );
          posts.push(post);
          if (post.intent === "aside") {
            return { ok: true, content: `answer ${posts.length}` };
          }
          return { ok: true, chat };
        },
        Component: () => (
          <ChatSurface chat={chat} provider={provider} onClose={() => {}} />
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

  const byLabel = (label: string) =>
    container.querySelector<HTMLElement>(`[aria-label="${label}"]`);

  const asideField = () =>
    byLabel("Your aside") as HTMLTextAreaElement | null;

  const type = (el: HTMLTextAreaElement, text: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });

  return {
    container,
    posts,
    asideField,
    open: () => act(() => byLabel("Ask an aside")!.click()),
    close: () => act(() => byLabel("Discard this aside")!.click()),
    ask: async (text: string) => {
      await type(asideField()!, text);
      await act(async () => {
        asideField()!.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
      });
      // Let the fetcher settle.
      await act(async () => {});
    },
  };
}

test("the aside is closed until it is asked for", () => {
  const surface = mount();

  expect(surface.asideField()).toBe(null);
  expect(surface.container.querySelector('[aria-label="Ask an aside"]')).not.toBe(null);
});

test("asking an aside posts the aside intent, not a message", async () => {
  const surface = mount();
  surface.open();

  await surface.ask("btw what is a neap tide");

  expect(surface.posts).toEqual([
    { intent: "aside", content: "btw what is a neap tide", history: "[]" },
  ]);
});

/**
 * The record is the point. An aside that appended to the transcript would be
 * summarised into the note along with everything else.
 */
test("an aside leaves the transcript alone", async () => {
  const surface = mount();
  surface.open();

  await surface.ask("btw what is a neap tide");

  const transcript = surface.container.textContent ?? "";
  expect(transcript).toContain("what makes a spring tide");
  expect(surface.posts.some(p => p.intent === "send")).toBe(false);
});

/** The answer is shown, or there was no point asking. */
test("the aside shows its answer", async () => {
  const surface = mount();
  surface.open();

  await surface.ask("btw what is a neap tide");

  expect(surface.container.textContent).toContain("answer 1");
});

/**
 * The server stores nothing, so the client is the only thing holding the
 * aside — and it has to hand it back or a second "btw" is answered with no
 * memory of the first.
 */
test("a second aside carries the first back as history", async () => {
  const surface = mount();
  surface.open();

  await surface.ask("btw what is a neap tide");
  await surface.ask("and how often");

  expect(JSON.parse(surface.posts[1].history)).toEqual([
    { role: "user", content: "btw what is a neap tide" },
    { role: "assistant", content: "answer 1" },
  ]);
});

/** Discarding is what "unsaved" means: there is nowhere to get it back from. */
test("discarding the aside empties it", async () => {
  const surface = mount();
  surface.open();
  await surface.ask("btw what is a neap tide");

  surface.close();
  surface.open();

  expect(surface.container.textContent).not.toContain("answer 1");
  expect(surface.asideField()!.value).toBe("");
});
