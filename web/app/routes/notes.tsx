import { useRouteLoaderData, useSearchParams } from "react-router";
import type { Route } from "./+types/notes";
import Notegrid from "~/notes/notegrid";
import { api, ApiError } from "~/lib/api.server";
import { requireToken } from "~/lib/session.server";
import type { Note } from "~/lib/types";

export function meta() {
  return [{ title: "Notes" }, { name: "description", content: "Your notes" }];
}

// No loader: the workspace layout above holds the note list, so there is one
// fetch and one revalidation shared by the landing page and the grid.

/**
 * Every note mutation goes through here. The browser submits a form, React
 * Router runs this on the server, and the loader above re-runs automatically —
 * so the UI reflects the database without any manual refetching.
 */
export async function action({ request }: Route.ActionArgs) {
  const token = await requireToken(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    switch (intent) {
      case "create": {
        const title = String(formData.get("title") ?? "").trim();
        const content = String(formData.get("content") ?? "").trim();
        // No "Untitled" fallback. The API used to require a non-empty title,
        // which is what made every note the app created on the reader's behalf
        // arrive already named — and so indistinguishable from one they named.
        // The id comes back so the ghost card can open the note it just made.
        const created = await api.createNote(token, { title, content });
        return { ok: true, id: created.id };
      }
      case "update": {
        const id = Number(formData.get("id"));
        const title = String(formData.get("title") ?? "").trim();
        const content = String(formData.get("content") ?? "").trim();
        await api.updateNote(token, id, { title, content });
        return { ok: true };
      }
      case "close": {
        /*
          The reader stepped out of the note. Write what is in the fields, then
          let the server decide whether anything came of it.

          Two calls in sequence rather than two fetchers, and the order is the
          whole point: clearing a note and then leaving it has to land the empty
          text *before* anything judges whether the note is empty. In parallel
          those race, and which one wins decides whether the note survives.
        */
        const id = Number(formData.get("id"));
        const title = String(formData.get("title") ?? "").trim();
        const content = String(formData.get("content") ?? "").trim();
        await api.updateNote(token, id, { title, content });
        await api.closeNote(token, id);
        return { ok: true };
      }
      case "archive": {
        await api.archiveNote(token, Number(formData.get("id")));
        return { ok: true };
      }
      case "unarchive": {
        await api.unarchiveNote(token, Number(formData.get("id")));
        return { ok: true };
      }
      case "togglePin": {
        const id = Number(formData.get("id"));
        const isPinned = formData.get("isPinned") === "true";
        await api.updateNote(token, id, { is_pinned: !isPinned });
        return { ok: true };
      }
      case "touch": {
        // Opening a note counts as an update for "where you left off".
        await api.touchNote(token, Number(formData.get("id")));
        return { ok: true };
      }
      case "delete": {
        await api.deleteNote(token, Number(formData.get("id")));
        return { ok: true };
      }
      default:
        return { ok: false, error: `Unknown intent: ${String(intent)}` };
    }
  } catch (error) {
    // Surface API failures to the UI instead of crashing the whole route.
    if (error instanceof ApiError) {
      return { ok: false, error: error.detail };
    }
    throw error;
  }
}

export default function Notes() {
  const workspace = useRouteLoaderData("routes/workspace") as {
    notes: Note[];
    archived: Note[];
  };
  const [searchParams] = useSearchParams();
  const open = Number(searchParams.get("open"));

  // No chats: the library is a list of notes, and a conversation is reached by
  // opening the note it belongs to. `?chat=` is the workspace layout's to read.
  //
  // Both halves of the library come from that layout's loader, so `?archived=1`
  // picks between two lists already in hand rather than asking for one.
  return (
    <Notegrid
      notes={workspace.notes}
      archived={workspace.archived}
      showArchived={searchParams.get("archived") === "1"}
      openNoteId={Number.isFinite(open) && open > 0 ? open : null}
    />
  );
}
