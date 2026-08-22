import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useFetcher, useNavigate } from "react-router";
import { motion } from "framer-motion";
import { Pin, Trash2, Archive, Plus, MessagesSquare } from "lucide-react";
import {
  noteLayoutId,
  NOTE_LAYOUT_TRANSITION,
} from "~/workspace/note-surface";
import GhostCard from "~/notes/ghost-card";
import LocalTime from "~/lib/local-time";
import ChatCard from "~/notes/chat-card";
import type { Chat, Note, VocabularyAnalysis } from "~/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "~/components/ui/dialog";

/**
 * The id the new-note ghost morphs from. No real note has 0, and the surface
 * claims the same layoutId on the other side of the navigation.
 */
const GHOST_ID = 0;

/** Notes and chats share the grid; `messages` is what tells them apart. */
type GridItem = Note | Chat;
const isChat = (item: GridItem): item is Chat => "messages" in item;

/** Ids restart per table, so a note and a chat can both be 7. */
const gridKey = (item: GridItem) => `${isChat(item) ? "chat" : "note"}-${item.id}`;

// 1. Separate Child Component declared OUTSIDE to fix unmounting & state-loss bug
function NoteCard({
  data,
  onExpand,
}: {
  data: Note;
  onExpand: (note: Note) => void;
}) {
  // Each card owns its fetcher so simultaneous pins/deletes don't clobber
  // each other's pending state.
  const fetcher = useFetcher();
  const knownFetcher = useFetcher();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  // The analysis comes back through a resource route, so the request carries
  // the session cookie and works wherever the app is served from. It used to
  // be a browser fetch to a hardcoded 127.0.0.1.
  const vocabFetcher = useFetcher<VocabularyAnalysis>();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const loading = vocabFetcher.state !== "idle";
  const vocabData = vocabFetcher.data ?? null;

  // Flashcard State
  const [isQuizMode, setIsQuizMode] = useState(false);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);

  // Optimistic UI: while a mutation is in flight, render what the user asked
  // for rather than the stale server value.
  const isPinned = fetcher.formData
    ? fetcher.formData.get("isPinned") === "false"
    : data.is_pinned;
  const isDeleting = fetcher.formData?.get("intent") === "delete";
  const title = data.title;
  const content = data.content;

  // Single click, because the card already renders `cursor: pointer` and a
  // pointer that does nothing is a promise the card was not keeping. The guard
  // is what lets the card's own actions still be clicked.
  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    onExpand(data);
  };

  const handleQuizClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsQuizMode(true);
    setCurrentWordIndex(0);
    setIsDialogOpen(true);
    if (!vocabData && vocabFetcher.state === "idle") {
      vocabFetcher.submit(
        { title: data.title, content: data.content ?? "" },
        {
          method: "post",
          action: "/api/vocabulary",
          encType: "application/json",
        },
      );
    }
  };

  // Dismissed words are filtered out here rather than edited out of the
  // fetcher's data, which is not ours to mutate.
  const words = vocabData
    ? Object.keys(vocabData.definitions).filter((w) => !dismissed.includes(w))
    : [];
  const currentWord = words[currentWordIndex];

  const handleNext = () => {
    setCurrentWordIndex((prev) => (prev + 1) % words.length);
  };

  const markAsKnown = (word: string) => {
    // The card goes first and the request follows; the endpoint returns no
    // body and there is nothing to wait for. It is idempotent by design, so a
    // resend on retry is harmless.
    const remaining = words.filter((w) => w !== word);
    setDismissed((prev) => [...prev, word]);
    if (currentWordIndex >= remaining.length) {
      setCurrentWordIndex(Math.max(0, remaining.length - 1));
    }

    knownFetcher.submit(
      { intent: "markKnown", word },
      { method: "post", action: "/notes" },
    );
  };

  // Remove the card immediately on delete instead of waiting for the round trip.
  if (isDeleting) return null;

  return (
    <>
      <motion.div
        // Shared with the expanded editor, so the card morphs into it — and so
        // the other cards glide to their new spots when the grid reflows.
        layoutId={noteLayoutId(data.id)}
        data-note-card
        onClick={handleCardClick}
        whileHover={{ y: -4, boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)" }}
        transition={{ layout: NOTE_LAYOUT_TRANSITION, duration: 0.15 }}
        style={{ borderRadius: 16 }}
        // No border, no shadow, no blur — one step of paper tone (DESIGN.md §5).
        className="group relative flex flex-col justify-between p-7 bg-paper-raised cursor-pointer select-none"
      >
        {/*
          layout="position" counter-scales the card's contents, so collapsing
          back out of the editor resizes the box without warping the text.
        */}
        <motion.div
          layout="position"
          transition={{ layout: NOTE_LAYOUT_TRANSITION }}
        >
          <div className="flex items-start justify-between gap-3 mb-2">
            {title && (
              <h3 className="font-display text-lg font-medium leading-snug tracking-tight text-ink">
                {title}
              </h3>
            )}
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="togglePin" />
              <input type="hidden" name="id" value={data.id} />
              <input type="hidden" name="isPinned" value={String(data.is_pinned)} />
              <motion.button
                type="submit"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={(e) => e.stopPropagation()}
                className={`p-1.5 rounded-lg opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer ${isPinned ? "opacity-100 text-accent-ink" : "text-ink/35 hover:text-ink"
                  }`}
              >
                <Pin className="size-3.5 fill-current" />
              </motion.button>
            </fetcher.Form>
          </div>
          {/* Capped and faded rather than whole — see `.note-preview` in
              app.css. A card is a glance at the note; you open it to read it. */}
          <p className="note-preview mt-2 text-base leading-relaxed text-ink/85 whitespace-pre-line">
            {content}
          </p>
          {data.created_at && (
            <div className="mt-6 text-sm italic text-ink/45">
              <LocalTime value={data.created_at} />
            </div>
          )}
        </motion.div>

        <motion.div
          layout="position"
          transition={{ layout: NOTE_LAYOUT_TRANSITION }}
          className="flex flex-col gap-2 mt-4"
        >
          {/*
            Action toolbar — separated by space, not a rule, and gathered at one
            end rather than pushed to both. Split across the card's full width,
            reaching the delete and then the review button was a trip of most of
            310px for two controls that belong to the same card.
          */}
          <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <div className="flex items-center gap-2">
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="delete" />
                <input type="hidden" name="id" value={data.id} />
                <motion.button
                  type="submit"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={(e) => e.stopPropagation()}
                  className="p-1.5 rounded-lg text-ink/35 hover:text-danger transition-colors cursor-pointer"
                  title="Delete note"
                >
                  <Trash2 className="size-3.5" />
                </motion.button>
              </fetcher.Form>

              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={(e) => e.stopPropagation()}
                className="p-1.5 rounded-lg text-ink/35 hover:text-ink transition-colors cursor-pointer"
                title="Archive"
              >
                <Archive className="size-3.5" />
              </motion.button>
            </div>

            <button
              onClick={handleQuizClick}
              className="px-4 py-1.5 text-sm rounded-lg bg-accent text-on-accent hover:opacity-90 transition-opacity cursor-pointer"
            >
              Review Words
            </button>
          </div>
        </motion.div>
      </motion.div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0 flex flex-row items-start justify-between">
            <div>
              <DialogTitle>Vocabulary Analysis</DialogTitle>
              <DialogDescription>
                Difficult words found in "{title || 'this note'}".
              </DialogDescription>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-6 mt-2">
            {loading ? (
              <p className="text-sm text-ink/60">Analyzing vocabulary...</p>
            ) : vocabData ? (
              words.length > 0 ? (
                isQuizMode ? (
                  <div className="flex flex-col items-center justify-center min-h-[250px] p-6 bg-paper-raised border border-hairline rounded-xl shadow-sm relative">
                    <button 
                      onClick={() => setIsQuizMode(false)}
                      className="absolute top-4 left-4 text-xs font-medium text-ink/60 hover:text-ink cursor-pointer"
                    >
                      &larr; Back to List
                    </button>
                    
                    <div className="flex flex-col items-center justify-center w-full mt-6">
                      <h2 className="text-3xl font-bold capitalize text-accent-ink mb-2">
                        {currentWord}
                      </h2>
                      <p className="text-base text-center font-medium text-ink/85 mb-6">
                        {vocabData.definitions[currentWord]}
                      </p>
                      
                      <div className="w-full text-center space-y-4">
                        <p className="text-sm text-ink/60">Keep this word in your difficult words list?</p>
                        <div className="flex items-center justify-center gap-3">
                          {words.length > 1 && (
                            <button
                              onClick={handleNext}
                              className="px-4 py-2 text-sm font-medium border border-ink/15 text-ink hover:bg-paper rounded-lg transition-colors cursor-pointer"
                            >
                              Keep
                            </button>
                          )}
                          <button
                            onClick={() => markAsKnown(currentWord)}
                            className="px-4 py-2 text-sm font-medium bg-danger/10 text-danger hover:bg-danger/20 rounded-lg transition-colors cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    <div className="absolute bottom-4 text-xs text-ink/45 font-medium">
                      Word {currentWordIndex + 1} of {words.length}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 pr-2">
                    {Object.entries(vocabData.definitions).map(([word, def]) => (
                      <div key={word} className="border-b border-hairline pb-2 last:border-0">
                        <h4 className="font-semibold capitalize text-accent-ink">{word}</h4>
                        <p className="text-sm text-ink/70 mt-1">{def}</p>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
                  <div className="p-3 bg-success/10 rounded-full text-success">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-ink/85">You know all the words here!</p>
                  <p className="text-xs text-ink/60">No complex vocabulary remaining in this note.</p>
                </div>
              )
            ) : (
              <p className="text-sm text-danger">Failed to load vocabulary analysis.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// 2. Parent Container Component
// Notes now arrive from the route loader, so this component holds no data state
// of its own — the database is the single source of truth.
export default function Notegrid({
  notes,
  chats = [],
  openNoteId = null,
  openChatId = null,
}: {
  notes: Note[];
  /** Conversations, shown beside the notes. Same library, two kinds of thing. */
  chats?: Chat[];
  /** Set when the landing hero handed a note over to be opened on arrival. */
  openNoteId?: number | null;
  /** Set when a chat is open as an overlay on the library. */
  openChatId?: number | null;
}) {
  // The open note is the workspace layout's, not the grid's — the grid only
  // has to leave a gap where it went. `?open=` is the single source of truth,
  // so opening is a URL change rather than local state.
  // Same for chats: the open chat lives above the grid, so filter it out.
  const navigate = useNavigate();
  const createFetcher = useFetcher<{ ok: boolean; id?: number }>();
  const chatFetcher = useFetcher<{ ok: boolean; id?: number }>();

  const gridNotes = notes.filter(n => n.id !== openNoteId);
  const pinnedNotes = gridNotes.filter(n => n.is_pinned);
  // A finished conversation is shown as the note it wrote, not as a second card
  // saying the same thing. Both halves of that test matter now that every chat
  // is bound to a note from the moment it exists: an unfinished one has a note
  // too, and it is the conversation you want to see, not an empty note. And a
  // chat finished before the binding has no note to stand in for it, so it
  // keeps its card rather than vanishing.
  const liveChats = chats.filter(c => !c.summary || c.note_id === null);
  const gridChats = openChatId ? liveChats.filter(c => c.id !== openChatId) : liveChats;
  // Interleaved by when they were last touched, not grouped by kind: the
  // library is a record of what you were working on, and splitting it into a
  // notes half and a chats half would make it two records instead.
  const rest: GridItem[] = [...gridNotes.filter(n => !n.is_pinned), ...gridChats].sort(
    (a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at),
  );

  const handleExpand = useCallback(
    (note: Note) => navigate(`/notes?open=${note.id}`, { preventScrollReset: true }),
    [navigate],
  );

  const handleOpenChat = useCallback(
    (chat: Chat) => navigate(`/notes?chat=${chat.id}`, { preventScrollReset: true }),
    [navigate],
  );

  // A new note has to exist before it can be the focused note, so the ghost
  // creates it and then opens it by id.
  const handleCompose = useCallback(() => {
    createFetcher.submit(
      { intent: "create", title: "Untitled", content: "" },
      { method: "post", action: "/notes" },
    );
  }, [createFetcher]);

  // Same shape for a conversation: it has to exist before it has a page.
  const handleNewChat = useCallback(() => {
    chatFetcher.submit({ intent: "create" }, { method: "post", action: "/chats" });
  }, [chatFetcher]);

  const openedNew = useRef(false);
  useEffect(() => {
    const id = createFetcher.data?.id;
    if (createFetcher.state !== "idle" || !id || openedNew.current) return;
    openedNew.current = true;
    navigate(`/notes?open=${id}`, { preventScrollReset: true });
  }, [createFetcher.state, createFetcher.data, navigate]);

  const openedChat = useRef(false);
  useEffect(() => {
    const id = chatFetcher.data?.id;
    if (chatFetcher.state !== "idle" || !id || openedChat.current) return;
    openedChat.current = true;
    navigate(`/notes?chat=${id}`, { preventScrollReset: true });
  }, [chatFetcher.state, chatFetcher.data, navigate]);

  /*
    The two ways to start something, as the first two cards in the grid.

    They used to be a flex row above it, pinned to either end, which at any real
    window width left them floating in a band of their own with a metre of
    nothing between them — and lifting them out cost the top right corner of the
    library, which stayed empty while the cards began below. As items in the
    flow they take the first two slots, the columns fill from the top across
    their whole width, and the grid has one rhythm instead of a header and then
    a rhythm.

    At the head of the unpinned flow rather than the page: pinned notes are the
    ones asked for at the top, and "New note" under a heading reading "Pinned"
    would be claiming something that is not true.
  */
  const starters = (
    <>
      <div className="mb-6 break-inside-avoid">
        <GhostCard
          tone="accent"
          label="New note"
          icon={<Plus className="size-7" strokeWidth={1.5} />}
          layoutId={noteLayoutId(GHOST_ID)}
          onClick={handleCompose}
        />
      </div>
      <div className="mb-6 break-inside-avoid">
        <GhostCard
          tone="ink"
          label="New AI chat"
          icon={<MessagesSquare className="size-7" strokeWidth={1.5} />}
          onClick={handleNewChat}
        />
      </div>
    </>
  );

  /**
   * CSS columns rather than a masonry library. The browser balances the
   * columns, every card is a keyed child that updates instead of remounting,
   * and it server-renders — so opening a note animates the rest of the grid
   * into its new shape rather than tearing the grid down and rebuilding it.
   */
  const columns = (items: GridItem[], lead?: ReactNode) => (
    <div className="columns-[280px] gap-6">
      {lead}
      {items.map(item => (
        <div key={gridKey(item)} className="mb-6 break-inside-avoid">
          {isChat(item) ? (
            <ChatCard data={item} onOpen={handleOpenChat} />
          ) : (
            <NoteCard data={item} onExpand={handleExpand} />
          )}
        </div>
      ))}
    </div>
  );

  return (
    // The surrounding page and the open note belong to the workspace layout;
    // this is only the grid that arrives beneath them.
    <div className="space-y-16">
      {pinnedNotes.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-display text-2xl font-medium tracking-tight text-ink">
            Pinned
          </h2>
          {columns(pinnedNotes)}
        </div>
      )}

      {/*
        Always rendered, even with nothing in `rest`: the two ways to start
        something live at the head of this flow, and a library with no unpinned
        notes still needs them.
      */}
      <div className="space-y-4">
        {pinnedNotes.length > 0 && (
          <h2 className="font-display text-2xl font-medium tracking-tight text-ink pt-4">
            Others
          </h2>
        )}
        {columns(rest, starters)}
      </div>
    </div>
  );
}