/**
 * @vitest-environment jsdom
 *
 * "Chat about this" is the note half of the loop, and the two directions are
 * not symmetrical.
 *
 * A conversation becomes a note by being summarised into it. A note becomes a
 * conversation by seeding one — once. The first time, the note's text is the
 * context the exchange starts from; every time after, the button is simply the
 * way back to a conversation that already has a history of its own.
 *
 * The ordering in the third test is the part that is easy to get wrong: the
 * backend takes the seed from the stored note, so an edit still sitting in the
 * field would be missing from the context of the conversation it started.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, expect, test } from "vitest";

import NoteSurface from "~/workspace/note-surface";
import type { Note } from "~/lib/types";

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
  id: 3,
  title: "Tides",
  content: "The moon pulls.",
  user_id: 1,
  is_pinned: false,
  created_at: NOW,
  updated_at: NOW,
  words: [],
};

let cleanup = () => {};
afterEach(() => cleanup());

function mount(conversationId: number | null) {
  const container = document.createElement("div");
  document.body.append(container);
  const log: Array<{ at: string; form: Record<string, string> }> = [];

  const record = (at: string) => async ({ request }: { request: Request }) => {
    const form = await request.formData();
    log.push({ at, form: Object.fromEntries(form) as Record<string, string> });
    return { ok: true, id: 42 };
  };

  const router = createMemoryRouter(
    [
      {
        path: "/notes",
        action: record("/notes"),
        Component: () => (
          <NoteSurface
            note={note}
            mode="boxed"
            conversationId={conversationId}
            onOpen={() => {}}
            onClose={() => {}}
            onReturn={() => {}}
          />
        ),
      },
      { path: "/chats", action: record("/chats") },
      { path: "/chats/:chatId", Component: () => <p>a conversation</p> },
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

  const button = () =>
    [...container.querySelectorAll("button")].find(b =>
      // The label follows the state — starting a thread and rejoining one are
      // not the same promise — so match either of the two it can carry.
      /Chat about this|Continue in chat/.test(b.textContent ?? ""),
    )!;

  return {
    router,
    log,
    click: async () => {
      await act(async () => {
        button().click();
        await new Promise(resolve => setTimeout(resolve, 0));
      });
    },
    type: (text: string) =>
      act(() => {
        const field = container.querySelector<HTMLTextAreaElement>(
          'textarea[aria-label="Note text"]',
        )!;
        Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        )!.set!.call(field, text);
        field.dispatchEvent(new Event("input", { bubbles: true }));
      }),
  };
}

test("a note that already has a conversation goes straight to it", async () => {
  const surface = mount(9);

  await surface.click();

  expect(surface.router.state.location.pathname).toBe("/chats/9");
  // Nothing was started: the conversation exists, and re-seeding it would put
  // the note back in front of a thread that has moved on.
  expect(surface.log.filter(entry => entry.at === "/chats")).toEqual([]);
});

test("a note without one starts a conversation from itself", async () => {
  const surface = mount(null);

  await surface.click();

  expect(surface.log.filter(entry => entry.at === "/chats")).toEqual([
    { at: "/chats", form: { intent: "create", noteId: "3" } },
  ]);
  expect(surface.router.state.location.pathname).toBe("/chats/42");
});

test("an edit still in the field is saved before the conversation starts", async () => {
  const surface = mount(null);

  await surface.type("The moon pulls, and so does the sun.");
  await surface.click();

  expect(surface.log.map(entry => entry.at)).toEqual(["/notes", "/chats"]);
  expect(surface.log[0].form.content).toBe("The moon pulls, and so does the sun.");
});
