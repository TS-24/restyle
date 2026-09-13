import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

/**
 * A note's text, cut into top-level blocks.
 *
 * The editor shows one block's markdown source at a time and leaves everything
 * around it rendered, so it needs to know where each block begins and ends in
 * the source string. That is the whole job of this file: no DOM, no React, one
 * string in and a list of spans out.
 *
 * Parsed rather than guessed at. Blank lines are the obvious heuristic and the
 * wrong one — a fenced code block can contain one, a loose list is separated by
 * them, and a table is several lines that must never be cut apart. remark
 * already hands every node its source offsets, and the app already depends on
 * remark to render this same text, so the two agree by construction.
 *
 * **Top-level children only**, which is the decision that makes the feature
 * work: a whole list is one block, a whole table is one block, a whole fenced
 * block is one block. The text above and below the active block is rendered
 * independently, so a cut inside a list would restart an ordered list's
 * numbering at 1 and a cut inside a table would render two broken halves.
 *
 * `remark-breaks` is deliberately not in this pipeline even though the renderer
 * uses it. It turns single newlines into hard breaks *inside* a paragraph and
 * does not change what the top-level children are, so including it would cost a
 * transform and change nothing here.
 *
 * What it costs: 1,889 bytes uncompressed on the note-surface chunk, measured
 * against the same build without this file. Almost nothing, because
 * `remark-parse` and `unified` are already in that chunk — `react-markdown`
 * pulls both, and markdown.tsx sits on the landing page's critical path. They
 * are declared in package.json all the same: importing a package that only
 * happens to be there transitively is one dependency bump away from breaking.
 */

/**
 * What a block renders as, which is what its source has to be typeset as.
 *
 * The names are remark's own apart from `rule`, which is `thematicBreak` said
 * shorter, and `paragraph`, which everything without a shape of its own folds
 * into — an HTML block and a link definition both read as the prose they look
 * like.
 */
export type BlockKind =
  | "paragraph"
  | "heading"
  | "list"
  | "code"
  | "blockquote"
  | "table"
  | "rule";

const KINDS: Record<string, BlockKind> = {
  heading: "heading",
  list: "list",
  code: "code",
  blockquote: "blockquote",
  table: "table",
  thematicBreak: "rule",
};

export type Block = {
  /** Character offset of the block's first character in the whole text. */
  start: number;
  /** Character offset one past its last character. */
  end: number;
  /** 1-based source line it starts on — what `data-line` in markdown.tsx holds. */
  startLine: number;
  /** What it renders as — see `.note-source` in app.css. */
  kind: BlockKind;
  /** A heading's level, and nothing else's. */
  depth?: number;
};

const parser = unified().use(remarkParse).use(remarkGfm);

type PositionedNode = {
  type?: string;
  depth?: number;
  position?: {
    start?: { offset?: number; line?: number };
    end?: { offset?: number };
  };
};

export function blocksOf(text: string): Block[] {
  if (!text.trim()) return [];

  const root = parser.parse(text) as { children?: PositionedNode[] };
  const blocks: Block[] = [];

  for (const node of root.children ?? []) {
    const start = node.position?.start?.offset;
    const end = node.position?.end?.offset;
    const startLine = node.position?.start?.line;
    // Every node remark produces from a string carries a position; the guard is
    // for the type, not for a case that happens.
    if (start === undefined || end === undefined || startLine === undefined) continue;
    const kind = KINDS[node.type ?? ""] ?? "paragraph";
    blocks.push(
      kind === "heading"
        ? { start, end, startLine, kind, depth: node.depth }
        : { start, end, startLine, kind },
    );
  }

  return blocks;
}

/**
 * Which block an absolute caret offset is in, or null when there are none.
 *
 * The gaps between blocks — the blank lines — belong to no block, and an offset
 * landing in one takes the block *before* it. Rounding down keeps the caret
 * where the reader last was instead of throwing it forward into text they were
 * leaving, which is what makes deleting back across a boundary feel like one
 * document rather than two.
 */
export function blockAtOffset(blocks: Block[], offset: number): number | null {
  if (blocks.length === 0) return null;

  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    if (offset >= blocks[i].start) return i;
  }
  return 0;
}
