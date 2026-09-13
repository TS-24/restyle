/**
 * Where one block of a note ends and the next begins.
 *
 * The note editor swaps a block to its markdown source when the caret is in it
 * and leaves the rest rendered, so the whole feature rests on being able to cut
 * the text into top-level pieces. Guessing at blank lines does not do it: a
 * fenced code block can contain one, a list item can be separated by one, and a
 * table is several lines that must not be cut apart.
 *
 * Pure — no DOM, no React — like app/workspace/note-surface.test.ts.
 */
import { describe, expect, test } from "vitest";

import { blocksOf, blockAtOffset } from "~/notes/blocks";

describe("blocksOf", () => {
  test("a heading, a paragraph and a list are three blocks", () => {
    const text = "## Tides\n\nThe moon pulls.\n\n- spring\n- neap";

    expect(blocksOf(text)).toHaveLength(3);
  });

  test("a whole list is one block, however many items", () => {
    const text = "- one\n- two\n- three\n- four\n- five";

    const blocks = blocksOf(text);

    expect(blocks).toHaveLength(1);
    // The reason this matters: cutting between items would restart an ordered
    // list's numbering in the rendered half below the caret.
    expect(text.slice(blocks[0].start, blocks[0].end)).toBe(text);
  });

  test("a fenced code block containing a blank line is one block", () => {
    const text = "```js\nconst a = 1;\n\nconst b = 2;\n```";

    expect(blocksOf(text)).toHaveLength(1);
  });

  test("a GFM table is one block", () => {
    const text = "| a | b |\n| - | - |\n| 1 | 2 |";

    const blocks = blocksOf(text);

    expect(blocks).toHaveLength(1);
    expect(text.slice(blocks[0].start, blocks[0].end)).toContain("| 1 | 2 |");
  });

  test("every block slices back to its own source", () => {
    const text = "# Title\n\nA paragraph.\n\n> a quote\n\n1. first\n2. second";

    for (const block of blocksOf(text)) {
      const source = text.slice(block.start, block.end);
      expect(source.length).toBeGreaterThan(0);
      expect(text).toContain(source);
    }
  });

  test("the blocks are in order and do not overlap", () => {
    const text = "# Title\n\nA paragraph.\n\n- a list";

    const blocks = blocksOf(text);

    for (let i = 1; i < blocks.length; i += 1) {
      expect(blocks[i].start).toBeGreaterThanOrEqual(blocks[i - 1].end);
    }
  });

  test("each block knows the line it starts on", () => {
    const text = "# Title\n\nA paragraph.";

    expect(blocksOf(text).map(b => b.startLine)).toEqual([1, 3]);
  });

  test("empty text has no blocks", () => {
    expect(blocksOf("")).toEqual([]);
  });

  test("whitespace alone has no blocks", () => {
    expect(blocksOf("\n\n   \n")).toEqual([]);
  });
});

/**
 * What each block *is*, which is what the editor has to typeset its source as.
 *
 * The surface used to sniff this itself with `/^#{1,6}\s/` over the block's
 * text. remark has already parsed the same string, so that was a second opinion
 * about a settled question — and a wrong one for a setext heading, which has no
 * `#` in it at all.
 */
describe("a block's kind", () => {
  const kindsOf = (text: string) => blocksOf(text).map(b => b.kind);

  test("the six block shapes a note is made of", () => {
    const text = [
      "# Heading",
      "",
      "A paragraph.",
      "",
      "- a list",
      "",
      "> a quote",
      "",
      "```js\ncode\n```",
      "",
      "| a | b |\n| - | - |\n| 1 | 2 |",
      "",
      "---",
    ].join("\n");

    expect(kindsOf(text)).toEqual([
      "heading",
      "paragraph",
      "list",
      "blockquote",
      "code",
      "table",
      "rule",
    ]);
  });

  test("a heading carries the level it renders at", () => {
    expect(blocksOf("### Third")[0].depth).toBe(3);
  });

  test("a setext heading is a heading too, `#` or no `#`", () => {
    // The regex this replaces could not see one.
    const [block] = blocksOf("Underlined\n==========");

    expect(block.kind).toBe("heading");
    expect(block.depth).toBe(1);
  });

  test("only a heading has a level", () => {
    expect(blocksOf("A paragraph.")[0].depth).toBeUndefined();
  });

  test("anything else reads as prose, because its source does", () => {
    // An HTML block, a link definition. Neither has a rendered shape of its own
    // worth typesetting the source as.
    expect(kindsOf("<div>raw</div>\n\n[ref]: https://example.com")).toEqual([
      "paragraph",
      "paragraph",
    ]);
  });
});

describe("blockAtOffset", () => {
  const text = "# Title\n\nA paragraph.\n\n- a list";
  const blocks = blocksOf(text);

  test("an offset inside a block finds it", () => {
    expect(blockAtOffset(blocks, text.indexOf("paragraph"))).toBe(1);
  });

  test("the very start of a block belongs to that block, not the one before", () => {
    expect(blockAtOffset(blocks, blocks[1].start)).toBe(1);
  });

  test("the end of a block still belongs to it, so a caret there can type on", () => {
    expect(blockAtOffset(blocks, blocks[0].end)).toBe(0);
  });

  test("an offset in the blank line between two blocks takes the earlier one", () => {
    // The gap belongs to nothing. Rounding down keeps the caret where the
    // reader last was rather than jumping it forward a block.
    const gap = blocks[0].end + 1;

    expect(blockAtOffset(blocks, gap)).toBe(0);
  });

  test("past the end lands on the last block", () => {
    expect(blockAtOffset(blocks, text.length + 50)).toBe(blocks.length - 1);
  });

  test("before the start lands on the first block", () => {
    expect(blockAtOffset(blocks, 0)).toBe(0);
  });

  test("no blocks at all is null rather than an index into nothing", () => {
    expect(blockAtOffset([], 0)).toBeNull();
  });
});
