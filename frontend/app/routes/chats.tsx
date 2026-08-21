import type { Route } from "./+types/chats";
import { api, ApiError } from "~/lib/api.server";
import { requireToken } from "~/lib/session.server";

/**
 * Where a conversation is started and ended.
 *
 * Action only, no component — a resource route, like api.word-ladder.tsx. It is
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
        // The id comes back so the ghost card can open what it just made, the
        // same handshake the new-note ghost uses.
        const created = await api.createChat(token);
        return { ok: true, id: created.id };
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
