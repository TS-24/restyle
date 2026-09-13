import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useFetcher, useNavigate } from "react-router";
import { motion } from "framer-motion";
import { Pin, Trash2, Archive, ArchiveRestore, Plus, MessagesSquare } from "lucide-react";
import {
  noteLayoutId,
  NOTE_LAYOUT_TRANSITION,
} from "~/workspace/note-surface";
import GhostCard from "~/notes/ghost-card";
import Markdown from "~/notes/markdown";
import LocalTime from "~/lib/local-time";
import type { Note } from "~/lib/types";

/**
 * The id the new-note ghost morphs from. No real note has 0, and the surface
 * claims the same layoutId on the other side of the navigation.
 */
const GHOST_ID = 0;

// 1. Separate Child Component declared OUTSIDE to fix unmounting & state-loss bug
function NoteCard({
  data,
  onExpand,
  archived = false,
}: {
  data: Note;
  onExpand: (note: Note) => void;
  /** Drawn in the archive, where the one action that matters is coming back. */
  archived?: boolean;
}) {
  // Each card owns its fetcher so simultaneous pins/deletes don't clobber
  // each other's pending state.
  const fetcher = useFetcher();
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
              app.css. A card is a glance at the note; you open it to read it.

              Rendered, because a note written by a finished conversation is
              headings and paragraphs, and a card showing its `##` is a card
              showing the machinery rather than the note. */}
          <Markdown className="note-preview mt-2 text-base leading-relaxed text-ink/85">
            {content ?? ""}
          </Markdown>
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

              {/*
                Put away, or bring back — the same button either way, because
                the archive is this list under the other filter rather than
                somewhere else the note has gone.
              */}
              <fetcher.Form method="post">
                <input
                  type="hidden"
                  name="intent"
                  value={archived ? "unarchive" : "archive"}
                />
                <input type="hidden" name="id" value={data.id} />
                <motion.button
                  type="submit"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={(e) => e.stopPropagation()}
                  className="p-1.5 rounded-lg text-ink/35 hover:text-ink transition-colors cursor-pointer"
                  title={archived ? "Restore" : "Archive"}
                >
                  {archived ? (
                    <ArchiveRestore className="size-3.5" />
                  ) : (
                    <Archive className="size-3.5" />
                  )}
                </motion.button>
              </fetcher.Form>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </>
  );
}

// 2. Parent Container Component
// Notes now arrive from the route loader, so this component holds no data state
// of its own — the database is the single source of truth.
export default function Notegrid({
  notes,
  archived = [],
  showArchived = false,
  openNoteId = null,
}: {
  notes: Note[];
  /** What has been put away. Loaded alongside `notes`, so the toggle is free. */
  archived?: Note[];
  /** Which of the two the grid is drawing — `?archived=1` in the URL. */
  showArchived?: boolean;
  /** Set when the landing hero handed a note over to be opened on arrival. */
  openNoteId?: number | null;
}) {
  /*
    The library is a list of notes, and only notes.

    Conversations used to have cards of their own here, which made the grid two
    kinds of thing and gave a chat two ways in — its own card, and the note it
    was bound to. Every conversation has a note now, so the note is what stands
    for it; you reach the conversation by opening that note and asking for it.

    The open note is the workspace layout's, not the grid's — the grid only has
    to leave a gap where it went. `?open=` is the single source of truth, so
    opening is a URL change rather than local state.
  */
  const navigate = useNavigate();
  const createFetcher = useFetcher<{ ok: boolean; id?: number }>();
  const chatFetcher = useFetcher<{ ok: boolean; id?: number; noteId?: number }>();

  const gridNotes = (showArchived ? archived : notes).filter(n => n.id !== openNoteId);
  // Pinning is a claim about the top of the library, and the archive is not the
  // library — so in there the split collapses and the one flow is the archive's
  // own order, newest put away first, which the server already sorted.
  const pinnedNotes = showArchived ? [] : gridNotes.filter(n => n.is_pinned);
  const rest = showArchived
    ? gridNotes
    : gridNotes
        .filter(n => !n.is_pinned)
        .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));

  const handleExpand = useCallback(
    (note: Note) => navigate(`/notes?open=${note.id}`, { preventScrollReset: true }),
    [navigate],
  );

  // A new note has to exist before it can be the focused note, so the ghost
  // creates it and then opens it by id.
  const handleCompose = useCallback(() => {
    createFetcher.submit(
      // Nameless. "Untitled" is what the field shows when this is empty, and
      // writing it here is what used to make an untouched note look named.
      { intent: "create", title: "", content: "" },
      { method: "post", action: "/notes" },
    );
  }, [createFetcher]);

  /*
    Same shape for a conversation, and it makes a note as well as a chat — a
    conversation with nothing to be about is a state the app does not have (see
    backend/app/api/chats.py::create_chat). So this is "a new note, and start
    talking about it straight away" rather than a second kind of thing.
  */
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
    const { id, noteId } = chatFetcher.data ?? {};
    if (chatFetcher.state !== "idle" || !id || !noteId || openedChat.current) return;
    openedChat.current = true;
    // Both, because the conversation is shown in the note's place: `?open=`
    // says which gap in the grid it comes out of and where closing it goes.
    navigate(`/notes?open=${noteId}&chat=${id}`, { preventScrollReset: true });
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
  /*
    The card that switches halves.

    Not a place of its own: it changes one search param, and both lists came
    down together in the workspace loader, so nothing is fetched and nothing
    reflows in from a route change. That is what makes it read as a filter.

    In the archive it is the only starter shown. Making a note from in there
    would open it with `?archived=1` still set, which is the archive displaying
    a note that is not in it — and there is no second way back out, so this card
    has to be it (DESIGN.md §9: one quiet way back).
  */
  const archiveToggle = (
    <div className="mb-6 break-inside-avoid">
      <GhostCard
        tone="ink"
        label={showArchived ? "Back to your notes" : "Archived"}
        icon={
          showArchived ? (
            <ArchiveRestore className="size-7" strokeWidth={1.5} />
          ) : (
            <Archive className="size-7" strokeWidth={1.5} />
          )
        }
        onClick={() =>
          navigate(showArchived ? "/notes" : "/notes?archived=1", {
            preventScrollReset: true,
          })
        }
      />
    </div>
  );

  const starters = showArchived ? (
    archiveToggle
  ) : (
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
      {archiveToggle}
    </>
  );

  /**
   * CSS columns rather than a masonry library. The browser balances the
   * columns, every card is a keyed child that updates instead of remounting,
   * and it server-renders — so opening a note animates the rest of the grid
   * into its new shape rather than tearing the grid down and rebuilding it.
   */
  const columns = (items: Note[], lead?: ReactNode) => (
    <div className="columns-[280px] gap-6">
      {lead}
      {items.map(item => (
        <div key={item.id} className="mb-6 break-inside-avoid">
          <NoteCard data={item} onExpand={handleExpand} archived={showArchived} />
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