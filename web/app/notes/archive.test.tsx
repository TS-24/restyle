/**
 * @vitest-environment jsdom
 *
 * The archive is a filter, not a second page.
 *
 * The library and the archive are one list of notes under `archived_at IS NULL`
 * and `IS NOT NULL`. Both arrive from the workspace loader in the same round of
 * requests, so the card that switches between them changes a search param and
 * nothing is fetched — which is the only reason it can feel like a filter
 * rather than a navigation.
 *
 * jsdom has no layout, so nothing here says anything about where a card sits.
 * What it can pin is which notes are rendered and what each control submits.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, expect, test } from "vitest";

import Notegrid from "~/notes/notegrid";
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

const note = (id: number, title: string, archived_at: string | null = null): Note => ({
  id,
  title,
  content: `The text of ${title}.`,
  user_id: 1,
  is_pinned: false,
  created_at: NOW,
  updated_at: NOW,
  archived_at,
});

const LIVE = [note(1, "Tides"), note(2, "Gerunds")];
const PUT_AWAY = [note(3, "Recipes", NOW)];

let cleanup = () => {};
afterEach(() => cleanup());

function mount({ showArchived = false } = {}) {
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
          <Notegrid notes={LIVE} archived={PUT_AWAY} showArchived={showArchived} />
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

  const headings = () =>
    [...container.querySelectorAll("h3")].map(h => h.textContent);
  const button = (label: string) =>
    container.querySelector<HTMLElement>(`[title="${label}"], [aria-label="${label}"]`);
  const click = async (element: HTMLElement | null) => {
    if (!element) throw new Error("no such control");
    await act(async () => {
      element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
  };

  return { container, sent, headings, button, click, router };
}

test("the library shows the live notes and not the archived ones", () => {
  const { headings } = mount();

  expect(headings()).toEqual(["Tides", "Gerunds"]);
});

test("the archived view shows the archived notes and not the live ones", () => {
  const { headings } = mount({ showArchived: true });

  expect(headings()).toEqual(["Recipes"]);
});

test("the archive card carries the reader between the two", async () => {
  const { button, click, router } = mount();

  await click(button("Archived"));

  expect(router.state.location.search).toBe("?archived=1");
});

test("and back again", async () => {
  const { button, click, router } = mount({ showArchived: true });

  await click(button("Back to your notes"));

  expect(router.state.location.search).toBe("");
});

test("the ways to start something are hidden inside the archive", () => {
  // Creating a note from in here would open it with `?archived=1` still set,
  // which is the archive showing a note that is not in it.
  const { button } = mount({ showArchived: true });

  expect(button("New note")).toBeNull();
  expect(button("New AI chat")).toBeNull();
});

test("a note's archive button puts it away", async () => {
  const { button, click, sent } = mount();

  await click(button("Archive"));

  expect(sent).toEqual([{ intent: "archive", id: "1" }]);
});

test("an archived note's button brings it back", async () => {
  const { button, click, sent } = mount({ showArchived: true });

  await click(button("Restore"));

  expect(sent).toEqual([{ intent: "unarchive", id: "3" }]);
});

test("a note with no title renders no heading rather than the word Untitled", () => {
  // The placeholder belongs in the field, not on the card.
  const container = document.createElement("div");
  document.body.append(container);
  const router = createMemoryRouter(
    [
      {
        path: "/notes",
        action: () => ({ ok: true }),
        Component: () => <Notegrid notes={[note(9, "")]} archived={[]} />,
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

  expect(container.querySelectorAll("h3")).toHaveLength(0);
});

test("New note asks for one with no title at all", async () => {
  const { button, click, sent } = mount();

  await click(button("New note"));

  expect(sent).toEqual([{ intent: "create", title: "", content: "" }]);
});
