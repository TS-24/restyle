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
  Chat,
  Note,
  ProviderSettings,
  User,
  VocabularyAnalysisResponse,
  WordDefinition,
  WordLadder,
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
  if (response.status === 401) {
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

  listNotes: (token: string, options: { search?: string } = {}) => {
    const params = new URLSearchParams();
    if (options.search) params.set("search", options.search);
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

  deleteNote: (token: string, id: number) =>
    request<void>(`/api/notes/${id}`, token, { method: "DELETE" }),

  listWords: (token: string) => request<WordDefinition[]>("/api/words", token),

  /**
   * The ladder for whatever the caret is standing in, plainest to rarest.
   *
   * A caret rather than a word, because the unit is not always the word under
   * it: "give up" has a ladder neither of its words can reach, and an article
   * travels with the word it attaches to. The response says which span it
   * resolved to.
   */
  getWordLadder: (token: string, sentence: string, caret: number) =>
    request<WordLadder>(
      `/api/vocab/ladder?${new URLSearchParams({ sentence, caret: String(caret) })}`,
      token,
    ),

  attachWord: (token: string, noteId: number, wordId: number) =>
    request<Note>(`/api/notes/${noteId}/words/${wordId}`, token, { method: "POST" }),

  detachWord: (token: string, noteId: number, wordId: number) =>
    request<Note>(`/api/notes/${noteId}/words/${wordId}`, token, { method: "DELETE" }),

  /**
   * The words worth learning in a body of text.
   *
   * Server-side like everything else here. It used to be called from the
   * browser against a hardcoded 127.0.0.1, which worked only on the machine
   * running the API and could not carry an HttpOnly cookie anywhere.
   */
  analyzeVocabulary: (token: string, data: { title: string; content: string }) =>
    request<VocabularyAnalysisResponse>("/api/analyze/vocabulary", token, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  /** Records words the reader says they already know. Returns no body. */
  markWordsKnown: (token: string, words: string[]) =>
    request<void>("/api/words/known", token, {
      method: "POST",
      body: JSON.stringify({ words }),
    }),

  listChats: (token: string) => request<Chat[]>("/api/chats", token),

  getChat: (token: string, id: number) => request<Chat>(`/api/chats/${id}`, token),

  /** Starts an empty conversation. A key is not needed until the first message. */
  createChat: (token: string) =>
    request<Chat>("/api/chats", token, { method: "POST", body: "{}" }),

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
};
