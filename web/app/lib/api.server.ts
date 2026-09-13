/**
 * Typed client for the FastAPI backend.
 *
 * The `.server.ts` suffix keeps this out of the browser bundle: it is only ever
 * imported by loaders and actions, which run on the React Router server. That
 * means the browser never talks to the backend directly, so there is no CORS to
 * configure and the API host stays private to the compose network.
 */

import { redirect } from "react-router";

import { destroyToken } from "./session.server";
import type {
  AdminInvite,
  AsideTurn,
  Chat,
  Invite,
  Note,
  ProviderSettings,
  ResetLink,
  User,
} from "./types";

const API_URL = process.env.API_URL ?? "http://localhost:8700";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`API ${status}: ${detail}`);
    this.name = "ApiError";
  }
}

/**
 * Every method takes the caller's token as its first argument rather than
 * reading an ambient one. It is more typing at each call site, and it is what
 * makes an unauthenticated request impossible to write by accident: there is
 * no signature here that compiles without one.
 */
async function request<T>(
  path: string,
  token: string | null,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  // An expired token is not an error the page can do anything with, so it
  // becomes a trip to the login screen rather than the error boundary. The
  // stale cookie is cleared on the way out, or the redirect would loop.
  //
  // Only when a token was actually sent. A 401 on a tokenless call — login,
  // register, spending a reset link — means the credentials in the *body* were
  // refused, and the caller has to be able to say so. Redirecting there sent
  // the reader back to a blank sign-in form with no word about what was wrong,
  // which is what a wrong password used to do.
  if (response.status === 401 && token !== null) {
    throw redirect("/login", { headers: { "Set-Cookie": await destroyToken() } });
  }

  if (!response.ok) {
    // FastAPI puts human-readable errors in `detail`; fall back to the status
    // text when the body is not JSON (e.g. a proxy returned HTML).
    let detail = response.statusText;
    try {
      const body = await response.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // keep statusText
    }
    throw new ApiError(response.status, detail);
  }

  // 204 No Content has an empty body, so there is nothing to parse.
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  /** The signed-in user. */
  getCurrentUser: (token: string) => request<User>("/api/users/me", token),

  listNotes: (token: string, options: { search?: string; archived?: boolean } = {}) => {
    const params = new URLSearchParams();
    if (options.search) params.set("search", options.search);
    // The library and the archive are one list under two filters, so this is a
    // param rather than a route of its own.
    if (options.archived) params.set("archived", "true");
    const query = params.toString();
    return request<Note[]>(`/api/notes${query ? `?${query}` : ""}`, token);
  },

  getNote: (token: string, id: number) => request<Note>(`/api/notes/${id}`, token),

  createNote: (token: string, data: { title: string; content?: string | null }) =>
    request<Note>("/api/notes", token, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateNote: (
    token: string,
    id: number,
    data: { title?: string; content?: string | null; is_pinned?: boolean },
  ) =>
    request<Note>(`/api/notes/${id}`, token, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  /** Records that a note was opened, moving it to the head of the list. */
  touchNote: (token: string, id: number) =>
    request<Note>(`/api/notes/${id}/touch`, token, { method: "POST" }),

  archiveNote: (token: string, id: number) =>
    request<Note>(`/api/notes/${id}/archive`, token, { method: "POST" }),

  unarchiveNote: (token: string, id: number) =>
    request<Note>(`/api/notes/${id}/unarchive`, token, { method: "POST" }),

  /**
   * The reader left this note. Answers 204 when it was blank and has been
   * dropped, 200 with the note when it stays — see backend close_note for the
   * three conditions, two of which this side cannot see.
   */
  closeNote: (token: string, id: number) =>
    request<Note | void>(`/api/notes/${id}/close`, token, { method: "POST" }),

  deleteNote: (token: string, id: number) =>
    request<void>(`/api/notes/${id}`, token, { method: "DELETE" }),

  listChats: (token: string) => request<Chat[]>("/api/chats", token),

  getChat: (token: string, id: number) => request<Chat>(`/api/chats/${id}`, token),

  /**
   * Starts a conversation. A key is not needed until the first message.
   *
   * With a note, the conversation is bound to it and seeded from its text —
   * and asking twice gives back the one that already exists, because the
   * binding is one-to-one. Without one, the backend makes a note for it: a
   * chat with no note is a state this app does not have.
   */
  createChat: (token: string, noteId?: number) =>
    request<Chat>("/api/chats", token, {
      method: "POST",
      body: JSON.stringify({ note_id: noteId ?? null }),
    }),

  /** Correct a conversation's name. See backend/app/api/chats.py::rename_chat. */
  renameChat: (token: string, id: number, title: string) =>
    request<Chat>(`/api/chats/${id}`, token, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),

  deleteChat: (token: string, id: number) =>
    request<void>(`/api/chats/${id}`, token, { method: "DELETE" }),

  /**
   * Says something and waits for the reply.
   *
   * The whole chat comes back rather than the two new turns, so there is one
   * shape for "here is the conversation now" instead of a delta to splice.
   * This is the slowest call in the app — a model is thinking at the other end
   * — so callers should show the pending turn rather than blocking on it.
   */
  sendChatMessage: (token: string, id: number, content: string) =>
    request<Chat>(`/api/chats/${id}/messages`, token, {
      method: "POST",
      body: JSON.stringify({ content }),
    }),

  /**
   * Asks beside the conversation without joining it.
   *
   * Answered with the transcript as context and stored nowhere, so the reply is
   * all that comes back. `history` is the aside's own turns, which only the
   * caller has — see backend/app/api/chats.py::ask_aside.
   */
  askAside: (
    token: string,
    id: number,
    content: string,
    history: AsideTurn[],
  ) =>
    request<{ content: string }>(`/api/chats/${id}/aside`, token, {
      method: "POST",
      body: JSON.stringify({ content, history }),
    }),

  /** Finishes a conversation and writes the three-part summary. */
  summarizeChat: (token: string, id: number) =>
    request<Chat>(`/api/chats/${id}/summarize`, token, { method: "POST" }),

  /** Which keys are on file, which could be added, and what is in use. */
  getProviderSettings: (token: string) =>
    request<ProviderSettings>("/api/settings/providers", token),

  /**
   * Stores one provider's key, after the backend has checked it works.
   *
   * The key travels from the browser to this server to the backend and is never
   * sent back down. It must not be logged anywhere along that path — including
   * in the error from a rejected key, which the backend has already scrubbed.
   *
   * Slow on purpose: the backend calls the provider before answering. That call
   * is the difference between a key that is stored and a key that is known to
   * work.
   */
  saveProviderKey: (token: string, provider: string, api_key: string) =>
    request<ProviderSettings>(`/api/settings/providers/${provider}`, token, {
      method: "PUT",
      body: JSON.stringify({ api_key }),
    }),

  /** Asks the stored key what it can reach now. */
  refreshProviderModels: (token: string, provider: string) =>
    request<ProviderSettings>(`/api/settings/providers/${provider}/refresh`, token, {
      method: "POST",
    }),

  forgetProviderKey: (token: string, provider: string) =>
    request<void>(`/api/settings/providers/${provider}`, token, { method: "DELETE" }),

  /** What this account chats with from now on. Both halves, always together. */
  setActiveModel: (token: string, provider: string, model: string) =>
    request<ProviderSettings>("/api/settings/active-model", token, {
      method: "PUT",
      body: JSON.stringify({ provider, model }),
    }),

  /**
   * Issues a single-use code bound to one address, and hands it back.
   *
   * Nothing is emailed. The code comes back to whoever asked for it and passing
   * it on is their business, which is what keeps this app off the end of a mail
   * provider and stops any signed-in user making the server send mail to an
   * address of their choosing.
   */
  issueInvite: (token: string, email: string) =>
    request<Invite>("/api/invites", token, {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  /** The codes this account issued, newest first. */
  listInvites: (token: string) => request<Invite[]>("/api/invites", token),

  /** Every code in the system. 403 for anyone but the superuser. */
  listAllInvites: (token: string) => request<AdminInvite[]>("/api/invites/all", token),

  /** Every account. 403 for anyone but the superuser. */
  listUsers: (token: string) => request<User[]>("/api/users", token),

  /** Exchanges credentials for a token. The only call with no token of its own. */
  login: (email: string, password: string) =>
    request<{ access_token: string }>("/api/auth/login", null, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  register: (data: {
    username: string;
    email: string;
    password: string;
    invite_code: string;
  }) =>
    request<{ access_token: string }>("/api/auth/register", null, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  /**
   * Mints a one-time reset link for an account. 403 for anyone but the
   * superuser, 404 when no account has that address.
   *
   * The URL comes back once and cannot be asked for again — only its hash is
   * stored — so whatever calls this has to show it immediately.
   */
  issueResetLink: (token: string, email: string) =>
    request<ResetLink>("/api/password-resets", token, {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  /**
   * Spends a reset link and returns a fresh session. A bad or expired token is
   * a 400 → ApiError here, not the 401 redirect, so the page can say why.
   */
  resetPassword: (token: string, password: string) =>
    request<{ access_token: string }>("/api/auth/reset-password", null, {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),
};
