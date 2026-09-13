import { redirect } from "react-router";

import { destroyToken } from "~/lib/session.server";

/**
 * Signing out is a POST, so a prefetch or a stray link cannot end a session.
 *
 * Clearing the cookie is what actually ends it here. The token itself stays
 * signed and valid until it expires — there is no revocation list — so this
 * stops this browser sending it and nothing more.
 */
export async function action() {
  return redirect("/login", { headers: { "Set-Cookie": await destroyToken() } });
}

// A GET has nothing to do but bounce: there is no page here.
export async function loader() {
  return redirect("/");
}
