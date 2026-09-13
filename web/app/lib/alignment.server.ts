/**
 * Which way this browser aligns a note's text.
 *
 * A cookie rather than a user column, for the reason `theme.server.ts` gives at
 * length: the root loader can resolve it from the request itself, so the markup
 * leaves the server already aligned. A value fetched over the network would
 * arrive after the page had painted, and text jumping from one side to the
 * other is a more obvious flash than a colour change.
 *
 * `getAlignment` is the single seam. Moving the preference onto the user record
 * later means changing this function and nothing else.
 */

import { createCookie } from "react-router";

import { resolveAlignment, type Alignment } from "./alignment";

export const ALIGN_COOKIE = "__align";

const ONE_YEAR = 60 * 60 * 24 * 365;

const alignmentCookie = createCookie(ALIGN_COOKIE, {
  path: "/",
  sameSite: "lax",
  maxAge: ONE_YEAR,
  // No `secrets`, so no signature. A reader who edits this only changes where
  // their own words sit, and `resolveAlignment` rejects anything we do not ship.
});

export async function getAlignment(request: Request): Promise<Alignment> {
  const value = await alignmentCookie.parse(request.headers.get("Cookie"));
  return resolveAlignment(typeof value === "string" ? value : null);
}

export function commitAlignment(id: string): Promise<string> {
  return alignmentCookie.serialize(resolveAlignment(id).id);
}
