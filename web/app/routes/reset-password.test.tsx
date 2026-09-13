/**
 * @vitest-environment jsdom
 *
 * Per file, for the reason workspace.test.tsx gives — and jsdom is pinned below
 * 30 there for a Node 20 reason that applies to every file that asks for it.
 *
 * The page a reset link lands on. Whoever opens it cannot sign in, so the two
 * things worth pinning are that a link carrying a token asks for a password,
 * and that a link missing one says so rather than presenting a form whose
 * submission could only fail.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, expect, test } from "vitest";

import ResetPassword from "~/routes/reset-password";
import type { Route } from "./+types/reset-password";
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

function mount(token: string, actionData?: { error: string }) {
  const container = document.createElement("div");
  document.body.append(container);

  const loaderData = { token };
  const params = {};
  const props: Route.ComponentProps = {
    loaderData,
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
        id: "routes/reset-password",
        params,
        pathname: "/reset-password",
        data: loaderData,
        loaderData,
        handle: undefined,
      },
    ],
  };

  const router = createMemoryRouter(
    [{ path: "/reset-password", Component: () => <ResetPassword {...props} /> }],
    { initialEntries: ["/reset-password"] },
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

test("a link with a token asks for the new password twice", () => {
  const container = mount("a-real-looking-token");

  expect(container.querySelectorAll('input[type="password"]').length).toBe(2);
  // Carried in a hidden field, so the submission does not depend on the URL
  // surviving the round trip.
  expect(container.querySelector<HTMLInputElement>('input[name="token"]')?.value).toBe(
    "a-real-looking-token",
  );
});

test("a link with no token says so instead of offering a dead form", () => {
  const container = mount("");

  expect(container.querySelector('input[type="password"]')).toBeNull();
  expect(container.querySelector('[role="alert"]')?.textContent).toMatch(
    /missing its token/i,
  );
});

/*
  The reason api.server.ts only redirects on a 401 when a token was sent. The
  backend answers a spent or expired link with 400 precisely so it arrives here
  as something to render, rather than becoming a redirect to a blank /login.
*/
test("a refused link says why", () => {
  const container = mount("spent-token", {
    error: "This reset link is invalid or has expired.",
  });

  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    "This reset link is invalid or has expired.",
  );
});
