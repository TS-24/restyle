import { api, ApiError } from "~/lib/api.server";
import { requireToken } from "~/lib/session.server";
import type { Route } from "./+types/api.active-model";

/**
 * Which provider and model this account chats with, changed from the chat.
 *
 * A resource route rather than an intent on the chat's own action, because the
 * choice is not the chat's: it is one setting on the account, and every
 * conversation uses it. Putting it in `chats/:chatId` would have made it look
 * like a property of the chat you happened to be in when you changed it.
 *
 * Both halves go together. The backend checks the model against the key it
 * belongs to, and a model on its own does not say which key that is.
 */
export async function action({ request }: Route.ActionArgs) {
  const token = await requireToken(request);
  const { provider, model } = await request.json();

  try {
    return { ok: true as const, provider: await api.setActiveModel(token, String(provider), String(model)) };
  } catch (error) {
    // 409 for a provider with no key, 422 for a model it does not offer. Both
    // are the same remedy — go to settings — and both say so themselves.
    if (error instanceof ApiError) return { ok: false as const, error: error.detail };
    throw error;
  }
}
