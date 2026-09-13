/**
 * @vitest-environment jsdom
 *
 * A note nobody wrote in does not survive being left.
 *
 * The app makes these constantly — "New note", "New AI chat", and the workspace
 * loader on an empty account all create one — and until `Untitled` became
 * placeholder text rather than a stored title, none of them were recognisably
 * empty. Now a blank note is genuinely blank, and closing it says so.
 *
 * Leaving is the moment, not arriving: a note is created blank and opened, so a
 * rule that fired any earlier would delete what the button just made. The
 * server decides in the end (`crud/note.py::close_note`, which also refuses to
 * take your last note); `isBlank` here only spares the round trip in the common
 * case, so the two disagreeing costs a wasted request and nothing else.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

import NoteSurface, { isBlank } from "~/workspace/note-surface";
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

const noteWith = (title: string, content: string): Note => ({
  id: 3,
  title,
  content,
  user_id: 1,
  is_pinned: false,
  created_at: NOW,
  updated_at: NOW,
  archived_at: null,
});

describe("isBlank", () => {
  test("nothing at all is blank", () => {
    expect(isBlank("", "")).toBe(true);
  });

  test("whitespace alone is blank", () => {
    expect(isBlank("   ", "\n\t ")).toBe(true);
  });

  test("a title alone is not", () => {
    expect(isBlank("Groceries", "")).toBe(false);
  });

  test("a body alone is not", () => {
    expect(isBlank("", "Flour, water, salt.")).toBe(false);
  });

  test("a note the reader named 'Untitled' is not blank", () => {
    // The word is placeholder text, never a value — so typing it is naming the
    // note, and old rows still carrying it as a real title keep it.
    expect(isBlank("Untitled", "")).toBe(false);
  });
});

let cleanup = () => {};
afterEach(() => cleanup());

function mount(note: Note, mode: "page" | "boxed") {
  const container = document.createElement("div");
  document.body.append(container);
  const sent: Array<Record<string, string>> = [];

  const router = createMemoryRouter(
    [
      {
        path: "/notes",
        async action({ request }) {
          sent.push(Object.fromEntries(await request.formData()) as Record<string, string>);
          return { ok: true };
        },
        Component: () => (
          <NoteSurface
            note={note}
            mode={mode}
            conversationId={null}
            onOpen={() => {}}
            onClose={() => {}}
            onReturn={() => {}}
          />
        ),
      },
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

  return sent;
}

/** Escape is handled on `document`, so focus does not have to be anywhere. */
async function pressEscape() {
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  });
}

describe("leaving a note", () => {
  test("a blank one is closed, which is what deletes it", async () => {
    const sent = mount(noteWith("", ""), "boxed");

    await pressEscape();

    expect(sent).toEqual([{ intent: "close", id: "3", title: "", content: "" }]);
  });

  test("a written one is only saved", async () => {
    const sent = mount(noteWith("Tides", "The moon pulls."), "boxed");

    await pressEscape();

    // save() short-circuits when nothing changed, so nothing is sent at all —
    // and crucially not `close`, which is the assertion that matters.
    expect(sent.map(s => s.intent)).not.toContain("close");
  });

  test("the landing page sends nothing, because it is not leaving", async () => {
    // Escape there opens the note in the library. The same note stays on
    // screen, so deleting it would pull it out from under the reader.
    const sent = mount(noteWith("", ""), "page");

    await pressEscape();

    expect(sent).toEqual([]);
  });
});
