/**
 * Shapes returned by the backend API.
 *
 * These live outside api.server.ts so that client components can import them
 * without pulling server-only code into the browser bundle. Keep them in sync
 * with the Pydantic schemas in backend/app/schemas/.
 */

/** Mirrors backend/app/schemas/note.py::NoteRead */
export interface Note {
  id: number;
  title: string;
  content: string | null;
  user_id: number;
  is_pinned: boolean;
  created_at: string;
  /** Bumped by edits and by opening the note — drives "where you left off". */
  updated_at: string;
  /** Set while the note is put away. Null is the library, non-null the archive. */
  archived_at: string | null;
}

/** Mirrors backend/app/schemas/user.py::UserRead */
export interface User {
  id: number;
  username: string;
  email: string;
  /**
   * Whether this account may read the two listings on the settings page that
   * cover everybody. Not a secret and not what enforces anything: the endpoints
   * refuse on their own, and this only keeps the page from rendering a panel
   * whose loader would 403.
   */
  is_superuser: boolean;
}

/** Mirrors backend/app/schemas/invite.py::InviteRead */
export interface Invite {
  id: number;
  /**
   * The code itself. It is in the listing on purpose: the person who issued it
   * did so in order to pass it on, and this is the only place it can be read
   * again once the response that created it is gone.
   */
  code: string;
  /** Null on codes the CLI issued, which are bound to no address. */
  invited_email: string | null;
  created_at: string;
  used_at: string | null;
}

/** Mirrors backend/app/schemas/invite.py::InviteAdminRead */
export interface AdminInvite extends Invite {
  issued_by_email: string | null;
  used_by_email: string | null;
}

/** Mirrors backend/app/schemas/password_reset.py::ResetLinkRead */
export interface ResetLink {
  /** The address as it is stored, which may differ in case from the request. */
  email: string;
  /**
   * The whole link, token and all. Unlike an invite code this cannot be read
   * back later — only its hash is kept — so whatever receives this has to put
   * it on screen at once.
   */
  url: string;
  expires_in_minutes: number;
}

/** Mirrors backend/app/schemas/chat.py::ChatMessageRead */
export interface ChatMessage {
  id: number;
  /**
   * "system" is the note's text as it stood when the conversation began — a
   * turn nobody took. It is a role of its own rather than a user message so the
   * transcript can show it as where the conversation started rather than as
   * something the reader said.
   */
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

/**
 * Mirrors backend/app/schemas/chat.py::AsideTurn — one turn of a "btw".
 *
 * No id and no timestamp because there is no row: an aside is held in the
 * browser for as long as its panel is open and stored nowhere else, which is
 * why the client hands the whole of one back on every question.
 */
export interface AsideTurn {
  role: "user" | "assistant";
  content: string;
}

/** Mirrors backend/app/schemas/chat.py::ChatSummaryRead */
export interface ChatSummary {
  /** The subject matter written up as notes — prose, and the durable half. */
  notes: string;
  /** Things to go and do. Usually empty; most conversations imply none. */
  actions: string[];
  summarized_at: string;
  /**
   * The note this summary was written into, which is what the library shows in
   * the conversation's place. Null for chats summarised before notes were
   * written — those keep their card, because there is no note to show instead.
   */
  note_id: number | null;
}

/** Mirrors backend/app/schemas/chat.py::ChatRead */
export interface Chat {
  id: number;
  user_id: number;
  title: string;
  created_at: string;
  updated_at: string;
  /**
   * The note this conversation is two faces of: what it is summarised into when
   * it finishes, and what its text was seeded from if it began at a note. Set
   * from the moment the chat exists. Null only for conversations from before
   * the binding, which are not backfilled.
   */
  note_id: number | null;
  messages: ChatMessage[];
  /**
   * Null until the conversation is finished. This is the only test for
   * "finished" — there is no status field, on either side.
   */
  summary: ChatSummary | null;
}

/** Mirrors backend/app/schemas/provider.py::ProviderOption */
export interface ProviderOption {
  id: string;
  label: string;
  default_model: string;
}

/**
 * Mirrors backend/app/schemas/provider.py::ConfiguredProvider
 *
 * There is no field here for the API key and there must never be one: the
 * backend does not send it. `key_hint` is its last four characters, which is
 * enough to recognise which key is on file and not enough to be one.
 */
export interface ConfiguredProvider {
  provider: string;
  label: string;
  key_hint: string;
  /** What the key could reach when it was last checked. The picker's contents. */
  models: string[];
  models_fetched_at: string | null;
}

/** Mirrors backend/app/schemas/provider.py::ActiveModel */
export interface ActiveModel {
  provider: string;
  model: string;
}

/**
 * Mirrors backend/app/schemas/provider.py::ProviderSettingsRead
 *
 * One account can hold a key for each provider, so `configured` is a list. Null
 * `active` means there is no usable key at all, which is a different screen
 * from a picker with nothing in it.
 */
export interface ProviderSettings {
  available: ProviderOption[];
  configured: ConfiguredProvider[];
  active: ActiveModel | null;
}
