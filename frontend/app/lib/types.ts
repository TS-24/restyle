/**
 * Shapes returned by the backend API.
 *
 * These live outside api.server.ts so that client components can import them
 * without pulling server-only code into the browser bundle. Keep them in sync
 * with the Pydantic schemas in backend/app/schemas/.
 */

/** Mirrors backend/app/schemas/word_definition.py::WordDefinitionRead */
export interface WordDefinition {
  id: number;
  word: string;
  definition: string | null;
}

/** Mirrors backend/app/schemas/word_ladder.py::WordLadderRead */
export interface WordLadder {
  id: number;
  word: string;
  /** The WordNet part of speech the rungs were drawn from; "" when none. */
  pos: string;
  /** Plainest first. Climbing up the ladder means climbing this array. */
  rungs: string[];
  /** Where `word` itself sits in `rungs`. */
  origin_index: number;
  /**
   * The span the rungs replace, within the sentence that was sent. Wider than
   * the word under the caret when the unit is a phrase ("give up") or carries
   * an article ("an example").
   */
  start: number;
  end: number;
}

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
  words: WordDefinition[];
}

/** Mirrors backend/app/schemas/user.py::UserRead */
export interface User {
  id: number;
  username: string;
  email: string;
}

/** Mirrors backend/app/schemas/analyze.py::VocabularyAnalysis */
export interface VocabularyAnalysis {
  total_difficult_words: number;
  definitions: Record<string, string>;
}

/** The envelope the analyze endpoint returns it in. */
export interface VocabularyAnalysisResponse {
  vocabulary_analysis: VocabularyAnalysis;
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

/** Mirrors backend/app/schemas/chat.py::ChatSummaryRead */
export interface ChatSummary {
  /** What the conversation was about overall. */
  general: string;
  topics: string[];
  /** What the reader kept asking about, across all their turns. */
  questions: string;
  /** What the replies actually concentrated on. */
  answers: string;
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
