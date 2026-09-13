import type { Route } from "./+types/chat";
import { api, ApiError } from "~/lib/api.server";
import { requireToken } from "~/lib/session.server";

/**
 * What you do inside a conversation: say something, and finish it.
 *
 * Action only, no loader and no component. A conversation is not a place of its
 * own — it is shown in its note's place, by the workspace layout, out of data
 * that layout's loader has already fetched. This route exists so the surface's
 * fetchers have somewhere to post to.
 *
 * It was a page for a while. That is what made leaving one a hard cut: two
 * whole screens with no element in common and nothing for Framer to move.
 */
export async function action({ request, params }: Route.ActionArgs) {
  const token = await requireToken(request);
  const id = Number(params.chatId);
  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    switch (intent) {
      case "send": {
        const chat = await api.sendChatMessage(
          token,
          id,
          String(formData.get("content") ?? ""),
        );
        return { ok: true as const, chat };
      }
      case "aside": {
        /*
          A "btw", answered and then forgotten. Nothing is written, so nothing
          comes back but the answer — no chat, because the chat did not change.

          The aside's own turns arrive as JSON because the server keeps none of
          them: the browser is the only thing holding this conversation, and it
          hands the whole of it back on every question.
        */
        const history = JSON.parse(String(formData.get("history") ?? "[]"));
        const { content } = await api.askAside(
          token,
          id,
          String(formData.get("content") ?? ""),
          history,
        );
        return { ok: true as const, content };
      }
      case "finish": {
        return { ok: true as const, chat: await api.summarizeChat(token, id) };
      }
      default:
        return { ok: false as const, error: `Unknown intent: ${String(intent)}` };
    }
  } catch (error) {
    if (error instanceof ApiError) return { ok: false as const, error: error.detail };
    throw error;
  }
}
