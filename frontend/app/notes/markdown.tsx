import type { ComponentPropsWithoutRef, ElementType } from "react";
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

/** The line a click landed in, from the nearest block that declares one. */
export function lineAt(target: EventTarget | null): number | null {
  const block = (target as HTMLElement | null)?.closest?.("[data-line]");
  const line = Number(block?.getAttribute("data-line"));
  return Number.isFinite(line) && line > 0 ? line : null;
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
} as const;

export default function Markdown({
  children,
  className = "",
}: {
  children: string;
  className?: string;
}) {
  return (
    // `markdown` carries the type scale and block spacing — see app.css. It is
    // deliberately close to the textarea it replaces: this swaps in and out
    // under the caret, and a scale that disagreed with the raw text would make
    // the note jump every time you wrote in it.
    <div className={`markdown ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={BLOCKS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
