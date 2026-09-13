/**
 * @vitest-environment jsdom
 *
 * An archived note opens and reads like any other.
 *
 * The archive is a filter over the library, not a place notes have gone, so
 * `?open=` has to resolve against both halves. It reads only the live list, and
 * a card in the archived view is a card — clicking one has to arrive somewhere.
 *
 * The hero is the exception and stays on the live list: "where you left off"
 * means the library, and something you put away is not where you left off.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, expect, test } from "vitest";

import Workspace from "~/routes/workspace";
import type { Route } from "./+types/workspace";
import type { Note, User } from "~/lib/types";
import { DEFAULT_THEME } from "~/lib/themes";
import { DEFAULT_ALIGNMENT } from "~/lib/alignment";

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

const user: User = {
  id: 1,
  username: "reader",
  email: "reader@example.com",
  is_superuser: false,
};
const provider = { available: [], configured: [], active: null };

const loaderData = {
  notes: [note(1, "Live")],
  archived: [note(7, "Recipes", NOW)],
  user,
  chats: [],
  provider,
};

const rootLoaderData = { theme: DEFAULT_THEME, alignment: DEFAULT_ALIGNMENT };

const params = {};
const props: Route.ComponentProps = {
  loaderData,
  params,
  matches: [
    {
      id: "root",
      params,
      pathname: "/",
      data: rootLoaderData,
      loaderData: rootLoaderData,
      handle: undefined,
    },
    {
      id: "routes/workspace",
      params,
      pathname: "/notes",
      data: loaderData,
      loaderData,
      handle: undefined,
    },
  ],
};

let cleanup = () => {};
afterEach(() => cleanup());

function mount(entry: string) {
  const container = document.createElement("div");
  document.body.append(container);
  const router = createMemoryRouter(
    [
      {
        path: "/notes",
        action: () => ({ ok: true }),
        Component: () => <Workspace {...props} />,
      },
      { path: "/", action: () => ({ ok: true }), Component: () => <Workspace {...props} /> },
    ],
    { initialEntries: [entry] },
  );
  const root = createRoot(container);
  act(() => {
    root.render(<RouterProvider router={router} />);
  });
  cleanup = () => {
    act(() => root.unmount());
    container.remove();
  };
  return {
    router,
    body: () => container.querySelector("[data-note-body]")?.textContent,
  };
}

test("an archived note opens by id", () => {
  const { body } = mount("/notes?open=7");

  expect(body()).toContain("The text of Recipes.");
});

test("a live note still opens by id", () => {
  const { body } = mount("/notes?open=1");

  expect(body()).toContain("The text of Live.");
});

test("the landing hero is the live list's head, never an archived note", () => {
  const { body } = mount("/");

  expect(body()).toContain("The text of Live.");
});

test("closing an archived note lands back in the archived view", async () => {
  const { router } = mount("/notes?open=7&archived=1");

  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  });

  expect(router.state.location.search).toBe("?archived=1");
});

test("closing a live note lands back in the library", async () => {
  const { router } = mount("/notes?open=1");

  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  });

  expect(router.state.location.search).toBe("");
});
