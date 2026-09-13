import type { Route } from "./+types/chats";
import { api, ApiError } from "~/lib/api.server";
import { requireToken } from "~/lib/session.server";

/**
 * Where a conversation is started and ended.
 *
 * Action only, no component — a resource route, like api.active-model.tsx. It is
 * the counterpart of /notes' action: the things you do to a chat from *outside*
 * one, which is creating it from the library and deleting its card. Talking
 * inside a chat belongs to that chat's own route.
 */
export async function action({ request }: Route.ActionArgs) {
  const token = await requireToken(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    switch (intent) {
      case "create": {
        // The id comes back so the caller can open what it just made, the same
        // handshake the new-note ghost uses. `noteId` is set when the request
        // came from a note rather than from the library — in which case the id
        // may well be a conversation that already existed, since one note has
        // one thread.
        const noteId = Number(formData.get("noteId"));
        const created = await api.createChat(
          token,
          Number.isFinite(noteId) && noteId > 0 ? noteId : undefined,
        );
        // The note comes back with it, because a conversation is shown in its
        // note's place: the caller needs both halves of `?open=&chat=`. When
        // the request carried a note this is that note; when it did not, it is
        // the one the backend made to hold the conversation.
        return { ok: true, id: created.id, noteId: created.note_id };
      }
      case "rename": {
        await api.renameChat(
          token,
          Number(formData.get("id")),
          String(formData.get("title") ?? ""),
        );
        return { ok: true };
      }
      case "delete": {
        await api.deleteChat(token, Number(formData.get("id")));
        return { ok: true };
      }
      default:
        return { ok: false, error: `Unknown intent: ${String(intent)}` };
    }
  } catch (error) {
    // Surface API failures to the UI rather than crashing the route.
    if (error instanceof ApiError) return { ok: false, error: error.detail };
    throw error;
  }
}
