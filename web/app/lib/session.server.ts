/**
 * The browser's half of the session.
 *
 * The backend hands out a JWT but the cookie the browser holds is set here,
 * not there. They are different origins: the browser talks to this server and
 * never to the API, so a cookie set by FastAPI would be stored against a host
 * the browser never contacts and would never come back. The token therefore
 * travels in the login response body and is put into a cookie of our own.
 *
 * HttpOnly is the point of the whole arrangement. Script on the page cannot
 * read this cookie, so an XSS bug cannot walk off with the session the way it
 * could with a token in localStorage.
 */

import { createCookie, redirect } from "react-router";

const SEVEN_DAYS = 60 * 60 * 24 * 7;

/**
 * Signing the cookie stops a viewer editing it into a different session. It is
 * not encryption: the token inside is still readable by anyone holding the
 * cookie, which is exactly why HttpOnly does the real work.
 */
const secret = process.env.SESSION_SECRET;
if (!secret && process.env.NODE_ENV === "production") {
  throw new Error("SESSION_SECRET must be set in production");
}

export const sessionCookie = createCookie("__session", {
  httpOnly: true,
  path: "/",
  sameSite: "lax",
  // A Secure cookie is silently dropped over plain http, so hardcoding this
  // true makes local login appear to work and every request afterwards come
  // back 401 with nothing to show for it.
  secure: process.env.NODE_ENV === "production",
  maxAge: SEVEN_DAYS,
  secrets: secret ? [secret] : [],
});

export async function getToken(request: Request): Promise<string | null> {
  const value = await sessionCookie.parse(request.headers.get("Cookie"));
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function commitToken(token: string): Promise<string> {
  return sessionCookie.serialize(token);
}

export function destroyToken(): Promise<string> {
  return sessionCookie.serialize("", { maxAge: 0 });
}

/**
 * Where to send someone after they sign in.
 *
 * Only a path on this site is allowed. Taking the parameter at face value
 * would let a link like /login?next=https://elsewhere.example bounce a user
 * straight off the site immediately after authenticating, which is precisely
 * when they are least likely to look at the address bar. "//host" is rejected
 * too: it is protocol-relative and leaves the site just as effectively.
 */
export function safeRedirect(to: string | null, fallback = "/"): string {
  if (!to || !to.startsWith("/") || to.startsWith("//")) return fallback;
  return to;
}

/** The token, or a redirect to the login page carrying the way back. */
export async function requireToken(request: Request): Promise<string> {
  const token = await getToken(request);
  if (token) return token;

  const url = new URL(request.url);
  const next = encodeURIComponent(url.pathname + url.search);
  throw redirect(`/login?next=${next}`);
}
