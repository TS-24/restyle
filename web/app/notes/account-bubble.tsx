import { Link } from "react-router";

import type { User } from "~/lib/types";

/**
 * The way to your account, from the library only.
 *
 * Deliberately not on the landing page. DESIGN.md §9 rule 8 has chrome recede
 * with depth: while you are in the note you are meant to be writing, and the
 * only thing on screen should be your own words. The library is the view where
 * you are already browsing rather than writing, so this is the one place an
 * affordance like it belongs.
 *
 * Quiet by construction, because §11 rules out a persistent rail or top bar and
 * the house style for an exit is one serif line at Meta size. It is a hairline
 * and an initial, dimmed until hover.
 *
 * It sits in the page flow rather than floating. A fixed-position badge covers
 * whatever is beneath it — the first card, or the open note — and an opaque
 * background only hides that collision instead of preventing it. In flow it
 * reserves its own band at the top of the column, so nothing can pass under.
 */
export default function AccountBubble({ user }: { user: User }) {
  const initial = (user.username || user.email).trim().charAt(0).toUpperCase();

  return (
    <Link
      to="/settings"
      aria-label={`Account: ${user.username}`}
      title={user.email}
      className="flex h-9 w-9 items-center justify-center rounded-full
                 border border-ink/15 bg-paper text-sm text-ink/60 opacity-80 transition
                 hover:border-ink/30 hover:text-ink hover:opacity-100
                 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink/30
                 motion-reduce:transition-none"
    >
      {initial}
    </Link>
  );
}
