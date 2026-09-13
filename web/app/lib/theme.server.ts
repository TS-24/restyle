/**
 * Which palette this browser reads in.
 *
 * A cookie rather than a user column, so the theme is known from the request
 * itself and the root loader can resolve it without waiting on the API. That is
 * what keeps the server's first byte already in the right palette; a value
 * fetched over the network would arrive after the page had painted, which is
 * the flash of wrong theme every hand-rolled switcher starts with.
 *
 * Deliberately *not* HttpOnly, unlike the session cookie next door. That flag
 * exists to keep script away from a credential; this is a colour preference,
 * and hiding it would buy nothing while ruling out ever reading it on the
 * client. `app/components/ui/sidebar.tsx` keeps its open/closed state the same
 * way.
 *
 * `getTheme` is the single seam. Moving the preference onto the user record
 * later means changing this function and nothing else.
 */

import { createCookie } from "react-router";

import { resolveTheme, type Theme } from "./themes";

export const THEME_COOKIE = "__theme";

const ONE_YEAR = 60 * 60 * 24 * 365;

const themeCookie = createCookie(THEME_COOKIE, {
  path: "/",
  sameSite: "lax",
  maxAge: ONE_YEAR,
  // No `secrets`, so no signature. A reader who edits this only changes the
  // colours they see, and `resolveTheme` rejects anything we do not ship.
});

export async function getTheme(request: Request): Promise<Theme> {
  const value = await themeCookie.parse(request.headers.get("Cookie"));
  return resolveTheme(typeof value === "string" ? value : null);
}

export function commitTheme(id: string): Promise<string> {
  return themeCookie.serialize(resolveTheme(id).id);
}
