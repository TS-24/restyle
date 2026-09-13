/**
 * @vitest-environment jsdom
 *
 * Per file, for the reason workspace.test.tsx gives — and jsdom is pinned below
 * 30 there for a Node 20 reason that applies to every file that asks for it.
 *
 * A regression guard for the one thing this page has to do when it fails.
 * api.server.ts used to turn *every* 401 into a redirect to /login, including
 * the one the login endpoint itself answers with — so a wrong password threw
 * away the action's message and silently re-rendered an empty form. The guard
 * is the `token !== null` in that client; this pins the visible half of it.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, expect, test } from "vitest";

import Login from "~/routes/login";
import type { Route } from "./+types/login";
import { DEFAULT_THEME } from "~/lib/themes";
import { DEFAULT_ALIGNMENT } from "~/lib/alignment";

// The root loader's data, which every route's match tree carries.
const ROOT = { theme: DEFAULT_THEME, alignment: DEFAULT_ALIGNMENT };

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

let cleanup = () => {};
afterEach(() => cleanup());

function mount(actionData?: { error: string }) {
  const container = document.createElement("div");
  document.body.append(container);

  const params = {};
  const props: Route.ComponentProps = {
    loaderData: null,
    actionData,
    params,
    matches: [
      {
        id: "root",
        params,
        pathname: "/",
        data: ROOT,
        loaderData: ROOT,
        handle: undefined,
      },
      {
        id: "routes/login",
        params,
        pathname: "/login",
        data: null,
        loaderData: null,
        handle: undefined,
      },
    ],
  };

  const router = createMemoryRouter(
    [{ path: "/login", Component: () => <Login {...props} /> }],
    { initialEntries: ["/login"] },
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

test("a refused sign-in says so", () => {
  const container = mount({ error: "Incorrect email or password" });

  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    "Incorrect email or password",
  );
});

test("nothing is alarming before anything has been tried", () => {
  const container = mount();

  expect(container.querySelector('[role="alert"]')).toBeNull();
});
