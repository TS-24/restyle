import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Link, useFetcher } from "react-router";
import { motion, useReducedMotion } from "framer-motion";
import { MessagesSquare } from "lucide-react";
import WordRoller from "~/workspace/word-roller";
import type { Note } from "~/lib/types";

/**
 * The one note surface in the app.
 *
 * It is mounted by the workspace layout and stays mounted for as long as the
 * note does, so opening one is not a page swap — the same title and body
 * elements stay put while a box wraps in around them and the type resizes.
 * Opening a *different* note is the one thing that remounts it, and has to:
 * `layoutId` is an identity Framer will not let an element change in place.
 * Everything that differs between the landing page and the editor is a
 * property of this one element, which is what keeps the words from jumping.
 */

export type SurfaceMode = "page" | "boxed";

export const noteLayoutId = (id: number) => `note-${id}`;

/** Shared by the surface and by the cards reflowing around it. */
/*
  How long the surface takes to change mode.

  One number, because three things have to agree on it: the layout tween below,
  the CSS transition on the chrome, and the window the fields re-measure over.
  As separate literals they drift, and a chrome transition outlasting its tween
  is the heading arriving after the box it sits in.

  This is the duration the app was designed at. It was never the problem: it ran
  *after* a 190-436ms loader round trip, so the gesture took the better part of a
  second and the tween was blamed for the wait in front of it. With that round
  trip gone the morph starts on the frame you click, and the same 550ms reads as
  deliberate rather than slow. Shortening it was solving the wrong half.
*/
const MORPH_MS = 550;

export const NOTE_LAYOUT_TRANSITION = {
  type: "tween",
  duration: MORPH_MS / 1000,
  ease: [0.4, 0, 0.2, 1],
} as const;

/**
 * The CSS side of the morph: what the box is made of, tweening over the same
 * window the layout projection takes to move it. Exported because the chat
 * surface morphs the same way and must not carry a second literal — a chrome
 * transition that outlasts its tween is the box arriving before its paper.
 */
export const CHROME_TRANSITION = [
  "font-size",
  "padding",
  "background-color",
  "box-shadow",
  "min-height",
]
  .map(property => `${property} ${MORPH_MS}ms cubic-bezier(0.4,0,0.2,1)`)
  .join(", ");

const TYPE = {
  page: { title: "3.25rem", body: "1.25rem" },
  boxed: { title: "1.875rem", body: "1.125rem" },
};

/** A scroll position a measurement could disturb. */
export type Scroller = { at: () => number; to: (position: number) => void };

/**
 * Size a field to its text without moving what the reader is looking at.
 *
 * Collapsing to `auto` is the only way to let a field shrink, but the collapse
 * also shortens whatever the field is scrolling inside — the page, or the
 * note's own column — and the browser clamps that scroller to the shorter
 * content before the real height goes back on. The height is restored a
 * statement later and the scroll position is not, so every keystroke past the
 * first screenful threw the reader back to the top.
 *
 * Every write happens in one synchronous block, before the browser paints, so
 * the collapse is never seen.
 */
export function fitToText(
  field: HTMLTextAreaElement,
  scrollers: readonly Scroller[],
) {
  const before = scrollers.map(scroller => scroller.at());
  field.style.height = "auto";
  field.style.height = `${field.scrollHeight}px`;
  scrollers.forEach((scroller, i) => {
    // Only when it actually moved: assigning a scroll position is not free, it
    // cancels a smooth scroll in progress and fires a scroll event.
    if (scroller.at() !== before[i]) scroller.to(before[i]);
  });
}

/**
 * What a measurement here can disturb: the page, and only the page.
 *
 * The surface deliberately has no scroller of its own — it grows with the note
 * and the document grows with it — so this is a list of one. It stays a list
 * because `fitToText` is what a second scroller would go through, and a
 * signature that already takes them is one less thing to get wrong later.
 */
const PAGE_SCROLLER: Scroller = {
  at: () => window.scrollY,
  to: position => window.scrollTo(0, position),
};

// useLayoutEffect warns during SSR, where there is nothing to measure.
const useMeasureEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Grows a textarea to fit its text — the single sizing model in both modes, so
 * the field never switches contract mid-transition.
 *
 * Never trusts a zero-width measurement: `scrollHeight` on an unlaid-out field
 * reports the text wrapped one character per line, which once left the hero
 * title 603px tall.
 */
function useAutoHeight() {
  const ref = useRef<HTMLTextAreaElement>(null);
  const frame = useRef(0);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el || el.clientWidth === 0) return;
    fitToText(el, [PAGE_SCROLLER]);
  }, []);

  /**
   * Re-measure every frame for `ms`, for the stretch where the type is being
   * tweened underneath us and no resize event describes it. Idempotent: a
   * second call while one is running just extends it.
   */
  const track = useCallback(
    (ms: number) => {
      const until = performance.now() + ms;
      const step = () => {
        measure();
        frame.current =
          performance.now() < until ? requestAnimationFrame(step) : 0;
      };
      if (!frame.current) frame.current = requestAnimationFrame(step);
    },
    [measure],
  );

  /*
    Cancelling the frame has to clear the handle too, or nothing ever tracks again.

    React runs an effect's setup, cleanup and setup again on mount. The first
    pass started a loop; this cleanup cancelled the frame but left
    `frame.current` holding its id; and every later call read that stale id as
    "a loop is already running" and returned without starting one. So `track`
    was dead for the life of the component and the per-frame remeasure it exists
    for never happened — leaving the ResizeObserver below to do all of it, one
    callback per write, which is what overflowed its loop (240 "undelivered
    notifications" across a single 550ms morph).
  */
  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    },
    [],
  );

  // Mount only. Re-measuring on every render costs a forced layout per field
  // per keystroke, and the two fields never change together — the component
  // below re-measures each one against its own text. The observer and the font
  // callback beneath cover the cases where the height moves without the text.
  useMeasureEffect(measure, [measure]);

  useEffect(() => {
    const el = ref.current;
    if (!el?.parentElement) return;
    // The parent, not the field: observing the field would see the height we
    // just wrote and loop.
    const observer = new ResizeObserver(measure);
    observer.observe(el.parentElement);
    document.fonts?.ready.then(measure).catch(() => {});
    // A final correction once the type lands. Not enough on its own — see the
    // mode-change tracker in the component below.
    el.addEventListener("transitionend", measure);
    return () => {
      observer.disconnect();
      el.removeEventListener("transitionend", measure);
    };
  }, [measure]);

  return { ref, measure, track };
}

export default function NoteSurface({
  note,
  mode,
  onOpen,
  onClose,
  onReturn,
  conversationId = null,
}: {
  note: Note;
  mode: SurfaceMode;
  /** Landing only: the user asked to open this note in the library. */
  onOpen: () => void;
  /** Boxed only: collapse the note, leaving the library behind. */
  onClose: () => void;
  /** Boxed only: take the note back out to its own page. */
  onReturn: () => void;
  /** Set when this note is what finishing a conversation wrote. */
  conversationId?: number | null;
}) {
  const fetcher = useFetcher();
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content ?? "");
  const rootRef = useRef<HTMLDivElement>(null);
  const titleField = useAutoHeight();
  const bodyField = useAutoHeight();

  const boxed = mode === "boxed";
  const type = boxed ? TYPE.boxed : TYPE.page;
  /*
    §12 — the whole point of this surface is that the note does not jump, so
    reduced motion cannot simply drop the transition: it collapses it to nothing
    instead, which lands the note in its resting state in one frame. The mode
    still changes, it just stops being animated.
  */
  const reduced = useReducedMotion();
  const layoutTransition = reduced
    ? { ...NOTE_LAYOUT_TRANSITION, duration: 0 }
    : NOTE_LAYOUT_TRANSITION;
  const chromeTransition = reduced ? "none" : CHROME_TRANSITION;
  // What the fields actually sit on. The box is transparent on the landing
  // page, so there the surface is the page's own paper, not paper-raised —
  // the word roller masks against this and looked like a patch without it.
  const surface = boxed
    ? "var(--color-paper-raised)"
    : "var(--color-paper)";

  /*
    Where to put the caret after the word roller swaps a word out.

    It has to land just past the replacement, or the caret is no longer inside
    the word and the chevrons vanish mid-climb. Restoring it has to wait for
    React to commit the new text: a controlled textarea whose value changes puts
    the caret at the very end, so anything set before the commit — in the
    handler, or in a requestAnimationFrame, which is what this used to do — is
    immediately undone. A layout effect runs after the DOM is updated and before
    the browser paints, so the caret never visibly jumps.
  */
  const pendingCaret = useRef<{ field: HTMLTextAreaElement | null; at: number } | null>(
    null,
  );
  useMeasureEffect(() => {
    const pending = pendingCaret.current;
    if (!pending?.field) return;
    pendingCaret.current = null;
    pending.field.setSelectionRange(pending.at, pending.at);
  });

  // Re-measure a field when its own text changes, and both when the mode flips:
  // the type changes size then, so the line count can change even though the
  // text did not. Kept apart so that typing in the body does not also force a
  // layout of the title.
  useMeasureEffect(titleField.measure, [titleField.measure, title, boxed]);
  useMeasureEffect(bodyField.measure, [bodyField.measure, content, boxed]);

  /*
    …and keep re-measuring for the length of the tween, not just at its ends.

    The type animates for MORPH_MS, so the fields' heights have to animate with
    it. Nothing else reports that frame by frame: each field sits in a wrapper
    that fits it exactly (the word roller measures against it), so the parent
    the ResizeObserver watches is only as tall as the height we ourselves just
    wrote, and its width does not change during the tween at all — it fires
    once, not per frame. Measuring only at `transitionend` lets the height
    arrive in one step after the type has already moved, which reads as a blip
    in the heading.
  */
  useEffect(() => {
    // A little past the tween, so the last frame is the settled value. Every
    // frame of this forces two synchronous layouts per field, so the window is
    // kept as short as the tween allows.
    titleField.track(MORPH_MS + 40);
    bodyField.track(MORPH_MS + 40);
    // The hooks return a fresh object each render; the callbacks themselves are
    // stable, so depend on those or this runs on every keystroke.
  }, [boxed, titleField.track, bodyField.track]);

  const saved = useRef({ title: note.title, content: note.content ?? "" });
  const save = () => {
    const nextTitle = title.trim();
    const nextContent = content.trim();
    if (
      nextTitle === saved.current.title.trim() &&
      nextContent === saved.current.content.trim()
    ) {
      return;
    }
    saved.current = { title: nextTitle, content: nextContent };
    fetcher.submit(
      {
        intent: "update",
        id: String(note.id),
        title: nextTitle || "Untitled",
        content: nextContent,
      },
      { method: "post", action: "/notes" },
    );
  };

  /**
   * A click that missed both fields still means "write here".
   *
   * The page *is* the note, but the fields are only ever as large as the words
   * in them. On a 1440x783 window that left a 522x98 target floating in the
   * middle of the screen: the whole lower half of the page, both margins, and
   * the gap above the heading all landed on nothing at all. So a click that hit
   * no field goes to the field it was nearest, caret at the end, the way
   * clicking under the last line of any document does.
   *
   * mousedown rather than click, and the default prevented, because the
   * browser's own response to a mousedown on something unfocusable is to clear
   * focus once this returns — undoing it.
   */
  const handleMouseDown = (event: React.MouseEvent) => {
    // Left button only: a right click is asking for the context menu, not for
    // the caret.
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("textarea, button, a")) return;
    const title = titleField.ref.current;
    const body = bodyField.ref.current;
    if (!title || !body) return;
    // Above the note's first line reads as the heading. Everything lower — very
    // nearly all of the page — is the note.
    const field = event.clientY < body.getBoundingClientRect().top ? title : body;
    event.preventDefault();
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  };

  /*
    Double click toggles between the note's own page and the library around it,
    in both directions — but never out of a field, where a double click already
    means "select this word".

    It used to also refuse whenever the surface had focus, aimed at that same
    case and missing it: selecting a word only happens inside a field, which the
    first line here already excludes. What that caught instead was every double
    click after the user's first click landed anywhere — and with the handler
    above now putting the caret in the note, that would have been all of them.
    Since this gesture is the only way into an open note from the landing page,
    it has to work on the second try as well as the first.
  */
  const handleDoubleClick = (event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest("input, textarea, button")) return;
    if (boxed) {
      save();
      onReturn();
      return;
    }
    (document.activeElement as HTMLElement | null)?.blur();
    save();
    onOpen();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    // Escape is handled on `document` below, not here: this prop only fires
    // when focus is already inside the surface, which it is not after a card
    // click.
    if (event.key !== "Enter" || event.shiftKey) return;

    // Enter commits everywhere else in the app, but the body is the one place
    // that rule cannot hold: it is a multi-line writing surface, and a plain
    // Enter there is a paragraph break, not a request to stop writing. Sending
    // it away blurred the field mid-sentence — with onBlur saving and the
    // landing page having nothing to close, the note simply became untypable.
    if (event.target === bodyField.ref.current) return;

    commitAndLeave(event);
  };

  /** Save and step out of the field, which is what Enter means in a title. */
  const commitAndLeave = (event: React.KeyboardEvent) => {
    event.preventDefault();
    (event.target as HTMLElement).blur();
    if (boxed) onClose();
  };

  /*
    Boxed only: clicking the page around the note collapses it.

    The handler needs the current text and the current onClose, which is why
    this used to carry no dependency array at all — and so re-subscribed after
    every render, a document listener removed and added on every keystroke. A
    ref carries the fresh closure instead, leaving the subscription to change
    only when the mode does.
  */
  /*
    Escape, from anywhere on the page.

    It used to hang off `onKeyDown` on the root below, which meant it only ever
    fired when focus was already inside the surface — and opening a note from a
    card leaves focus on `<body>`, so the key never reached the handler at all.
    A document listener does not care where focus is.

    The ref carries the fresh closure for the same reason `collapse` does: the
    handler needs the current text and the current callbacks, and re-subscribing
    a document listener on every keystroke is what that costs otherwise.
  */
  const escape = useRef(() => {});
  useEffect(() => {
    escape.current = () => {
      save();
      // Boxed: collapse to the library. On the landing page the same key is the
      // reliable way into the library, which the double-click gesture cannot be
      // — the fields span the reading column, and a double click inside one
      // means "select this word".
      if (boxed) onClose();
      else onOpen();
    };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // A dialog over the note owns Escape while it is up — the vocabulary one
      // opens from a card in the grid behind an open note. Base UI keeps the
      // popup mounted through its close animation and marks it `data-closed`,
      // so only an un-closed one counts.
      if (document.querySelector('[data-slot="dialog-content"]:not([data-closed])')) {
        return;
      }
      event.preventDefault();
      escape.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const collapse = useRef(() => {});
  useEffect(() => {
    collapse.current = () => {
      save();
      onClose();
    };
  });
  useEffect(() => {
    if (!boxed) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (rootRef.current?.contains(target)) return;
      // Not anything with its own meaning. A card is a request to open *that*
      // note, so closing here would fire a second navigation and race the one
      // the card is about to start.
      if (target.closest("[data-note-card], button, a")) return;
      collapse.current();
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [boxed]);

  // Just the date. The landing page is not a "resume where you left off"
  // screen — it is the note itself, so the only context it needs is when the
  // note was last touched.
  const lastTouched = note.updated_at
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(
        new Date(note.updated_at),
      )
    : null;

  return (
    <motion.div
      layout
      layoutId={noteLayoutId(note.id)}
      /*
        Measure for a layout animation only when the note is actually moving
        between its two states. Left to itself Framer re-measures on every
        render, so each keystroke in a note taller than the box started a fresh
        tween of the whole surface — caught mid-word at scaleY(0.18).
        That squash and settle, on every character, is most of what made typing
        here feel like it was struggling.
      */
      layoutDependency={`${mode}:${note.id}`}
      transition={{ layout: layoutTransition }}
      ref={rootRef}
      role={boxed ? "dialog" : undefined}
      aria-label={boxed ? `Edit note: ${note.title || "Untitled"}` : undefined}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      onBlur={save}
      // Every difference between the two modes is a value on this one element,
      // so the change is an animation rather than a swap.
      style={{
        borderRadius: 24,
        // A floor, not a ceiling. Clipping the note you are writing is the
        // one place a height cap does not belong; the grid cards are where a
        // long note needs compacting, and that is where it happens.
        minHeight: boxed ? "68vh" : "78vh",
        padding: boxed ? "2.25rem 2.5rem" : "0rem",
        backgroundColor: boxed ? "var(--color-paper-raised)" : "transparent",
        boxShadow: boxed
          ? "0px 25px 50px -12px rgb(56 56 90 / 0.15)"
          : "0px 25px 50px -12px rgb(56 56 90 / 0)",
        transition: chromeTransition,
      }}
      // cursor-text because all of it now is: the handler above sends any click
      // that missed a field into the note.
      className="flex w-full cursor-text flex-col"
    >
      {/*
        The reading column, centred both ways in *both* modes, deliberately.
        text-align cannot be tweened, so alignment that differed between the two
        states would snap the words sideways the instant the box arrives — the
        one visible discontinuity in an otherwise continuous transition. The box
        moves around the text; the text stays put.

        Nothing clips it and nothing scrolls inside it: the column is as tall
        as the note, and the page grows to hold it. A writing surface that
        hides the end of its own text is the wrong place to save space —
        `.note-preview` on the grid cards is the right one.
      */}
      <div
        className={`mx-auto flex w-full flex-1 flex-col justify-center text-center ${
          boxed ? "max-w-4xl" : "max-w-3xl"
        }`}
      >
        <p
          className="font-sans text-sm italic text-accent-ink transition-opacity duration-500"
          style={{ opacity: boxed ? 0 : 1 }}
        >
          {lastTouched}
        </p>

        {/* Same contract as the body below: a wrapper that fits the field
            exactly, so the roller can measure against its origin. */}
        <div className="relative mt-6 w-full">
          <textarea
            ref={titleField.ref}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            rows={1}
            spellCheck={false}
            placeholder="Untitled"
            aria-label="Note title"
            // text-center on the field itself: form controls do not inherit
            // text-align from an ancestor.
            style={{ fontSize: type.title, transition: chromeTransition }}
            className="block w-full resize-none overflow-hidden border-none bg-transparent p-0 text-center font-display font-medium leading-[1.2] tracking-tight text-ink caret-accent-ink outline-none placeholder:text-ink/25"
          />
          <WordRoller
            fieldRef={titleField.ref}
            value={title}
            background={surface}
            onReplace={(start, end, word) => {
              setTitle(prev => prev.slice(0, start) + word + prev.slice(end));
              pendingCaret.current = {
                field: titleField.ref.current,
                at: start + word.length,
              };
            }}
          />
        </div>

        {/*
          The wrapper has to fit the field exactly and be the positioning
          context: the word roller measures against its origin.
        */}
        <div className="relative mx-auto mt-8 w-full max-w-[68ch]">
          <textarea
            ref={bodyField.ref}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={1}
            placeholder="Start writing…"
            aria-label="Note text"
            style={{ fontSize: type.body, transition: chromeTransition }}
            className="block w-full resize-none overflow-hidden border-none bg-transparent p-0 text-center font-sans leading-relaxed text-ink/85 caret-accent-ink outline-none placeholder:text-ink/25"
          />
          <WordRoller
            fieldRef={bodyField.ref}
            value={content}
            background={surface}
            onReplace={(start, end, word) => {
              setContent(prev => prev.slice(0, start) + word + prev.slice(end));
              pendingCaret.current = {
                field: bodyField.ref.current,
                at: start + word.length,
              };
            }}
          />
        </div>
      </div>

      {/*
        Chrome belongs to the box, so it fades in as the box wraps — but it
        keeps its height in both modes. Collapsing it on the landing page would
        shift the centred text as the box arrives.
      */}
      <div
        className="mx-auto flex h-20 w-full max-w-4xl shrink-0 items-center justify-between gap-4 transition-opacity duration-500"
        style={{ opacity: boxed ? 1 : 0, pointerEvents: boxed ? "auto" : "none" }}
      >
        <div className="flex items-baseline gap-5">
          <span className="text-sm italic text-ink/40">
            Esc to close · Enter for a new line
          </span>
          {/* The house form for an exit: one serif line at Meta size
              (DESIGN.md §8), not a button competing with the one opposite. */}
          {conversationId !== null && (
            <Link
              to={`/chats/${conversationId}`}
              className="text-sm tracking-wide text-ink/50 transition-colors hover:text-ink"
            >
              See the conversation →
            </Link>
          )}
        </div>
        {/*
          A placeholder, deliberately: it says what it will do and does not do it
          yet. "Done" stood here and went unused — Escape and a click outside
          both close the note, so the button was a third way to do what two
          gestures already did.
        */}
        <button
          type="button"
          aria-hidden={!boxed}
          tabIndex={boxed ? 0 : -1}
          className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2 text-base text-on-accent transition-opacity hover:opacity-90 cursor-pointer"
        >
          <MessagesSquare className="size-4" />
          Chat about this
        </button>
      </div>
    </motion.div>
  );
}
