import { useMemo, type ComponentPropsWithoutRef, type ElementType } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

/**
 * A note's text, rendered.
 *
 * Finishing a conversation writes headings into a note, and the body is an
 * unstyled textarea — so until now those landed as flat lines with a blank one
 * under them. This is the renderer that makes them headings.
 *
 * Raw HTML is off, which is react-markdown's default and is the reason not to
 * hand-roll this: the text can come from a model, and a note is rendered in the
 * same document as the session it was fetched with.
 *
 * Every block carries the line it came from. Mapping a click inside rendered
 * markdown back to a character offset in the source is not reliable — the
 * syntax that was consumed is gone, and emphasis and list markers make the two
 * strings different lengths in ways that do not line up. Mapping it to the
 * *block* is reliable, because remark hands every node its source position. A
 * click resolves to the start of that line and no further, which is enough to
 * put you where you were looking.
 *
 * `remark-breaks` is not decoration. Markdown reads a single newline as a
 * space, and these notes are plain text first and markdown second — most of
 * them are lines someone typed. Without it, opening any note written in short
 * lines would run them all into one paragraph, which is the renderer silently
 * rewriting what you wrote.
 *
 * What it costs: about 46kB gzipped on the shared surface chunk, measured
 * against the same build without it. Roughly 36kB of that is react-markdown and
 * micromark themselves and is the price of rendering markdown at all; the rest
 * is `remark-gfm`, which was measured separately at ~10kB and kept, because
 * dropping it buys back a tenth of the cost and loses tables, task lists and
 * strikethrough. It is on the landing page's critical path, which is worth
 * knowing before anything else is added to this file.
 */

/** Where the given 1-based source line begins, in characters. */
export function offsetOfLine(text: string, line: number): number {
  const lines = text.split("\n");
  let at = 0;
  for (let i = 0; i < Math.min(line - 1, lines.length); i += 1) {
    // +1 for the newline itself, which `split` dropped.
    at += lines[i].length + 1;
  }
  return Math.min(at, text.length);
}

/**
 * The line a click landed in, from the nearest block that declares one.
 *
 * `data-line-base` is what makes this work while a note is being edited. The
 * text below the caret is rendered as a markdown document of its own, so remark
 * numbers its lines from 1 again — a wrapper declaring where that document
 * starts in the whole note is what turns a local line back into a real one.
 * Without it a click near the bottom of a note resolves to a block near the top.
 */
export function lineAt(target: EventTarget | null): number | null {
  const block = (target as HTMLElement | null)?.closest?.("[data-line]");
  const line = Number(block?.getAttribute("data-line"));
  if (!Number.isFinite(line) || line <= 0) return null;

  const base = Number(
    block?.closest("[data-line-base]")?.getAttribute("data-line-base"),
  );
  return Number.isFinite(base) ? line + base : line;
}

type Node = { position?: { start?: { line?: number } } };

/** Tags the source line onto whatever remark produced for this block. */
function tagged<T extends ElementType>(Tag: T) {
  return ({ node, ...props }: ComponentPropsWithoutRef<T> & { node?: Node }) => {
    const line = node?.position?.start?.line;
    // @ts-expect-error — the spread is the tag's own props by construction.
    return <Tag data-line={line} {...props} />;
  };
}

/**
 * A link out of a note, in a tab of its own.
 *
 * Without a target this navigated the app away — the reader followed a
 * reference and lost the note it was in, back button or no back button. The
 * click stops here for the other half of the same rule: in the library this
 * markdown is inside a card whose own click opens the note, and a click on a
 * link means the link.
 *
 * `noopener` is spelled out even though `noreferrer` implies it: a note can be
 * written by a model, so its links are not all the reader's own, and the page
 * opened must not get a handle on the one it came from. The href itself is
 * already react-markdown's business — its default `urlTransform` is what keeps
 * a `javascript:` scheme out, and this does not override it.
 */
function Anchor({ node, ...props }: ComponentPropsWithoutRef<"a"> & { node?: Node }) {
  return (
    <a
      {...props}
      target="_blank"
      rel="noreferrer noopener"
      onClick={event => event.stopPropagation()}
    />
  );
}

/**
 * A task box that writes its tick back into the source.
 *
 * `remark-gfm` renders these `disabled`, which is right wherever there is
 * nowhere to write to — a grid card renders the same markdown and cannot edit
 * anything. So the box is only live where a handler was passed, and the line it
 * reports is resolved by the same `lineAt` a click into rendered markdown uses:
 * one answer to "where in the source is this", not two.
 */
const taskBox = (onToggle: (line: number) => void) =>
  function TaskBox({
    node,
    ...props
  }: ComponentPropsWithoutRef<"input"> & { node?: Node }) {
    if (props.type !== "checkbox") return <input {...props} />;
    return (
      <input
        {...props}
        disabled={false}
        onChange={event => {
          const line = lineAt(event.target);
          if (line !== null) onToggle(line);
        }}
      />
    );
  };

const BLOCKS = {
  p: tagged("p"),
  h1: tagged("h1"),
  h2: tagged("h2"),
  h3: tagged("h3"),
  h4: tagged("h4"),
  h5: tagged("h5"),
  h6: tagged("h6"),
  li: tagged("li"),
  blockquote: tagged("blockquote"),
  pre: tagged("pre"),
  // The containers as well as their contents. A list is indented and a table
  // has cell padding, so there is a strip of every one of these that belongs to
  // the block and carries none of its text — and a click landing there used to
  // resolve to no block at all, which means the end of the note. `closest`
  // still finds the `li` first when there is one.
  ul: tagged("ul"),
  ol: tagged("ol"),
  table: tagged("table"),
  hr: tagged("hr"),
  a: Anchor,
} as const;

export default function Markdown({
  children,
  className = "",
  onToggleTask,
}: {
  children: string;
  className?: string;
  /**
   * Where a tick goes. Given one, the task boxes are live; without one they
   * stay as `remark-gfm` drew them, which is what a card wants.
   */
  onToggleTask?: (line: number) => void;
}) {
  const components = useMemo(
    () => (onToggleTask ? { ...BLOCKS, input: taskBox(onToggleTask) } : BLOCKS),
    [onToggleTask],
  );
  return (
    // `markdown` carries the type scale and block spacing — see app.css. It is
    // deliberately close to the textarea it replaces: this swaps in and out
    // under the caret, and a scale that disagreed with the raw text would make
    // the note jump every time you wrote in it.
    <div className={`markdown ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
