import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  ALIGNMENTS,
  DEFAULT_ALIGNMENT,
  alignmentAttributes,
  resolveAlignment,
} from "./alignment";

/**
 * The registry is TypeScript and the alignment itself is CSS, so — exactly as
 * `themes.test.ts` does for the palettes — this reads `app.css` as text to
 * check the two agree. An id nobody wrote a rule for is a setting that silently
 * does nothing.
 */
const css = readFileSync(
  fileURLToPath(new URL("../app.css", import.meta.url)),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

describe("the alignment registry", () => {
  it("offers exactly left, centre and right", () => {
    expect(ALIGNMENTS.map((a) => a.id)).toEqual(["left", "center", "right"]);
  });

  it("has unique ids", () => {
    const ids = ALIGNMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("defaults to one it actually ships", () => {
    expect(ALIGNMENTS).toContain(DEFAULT_ALIGNMENT);
  });

  it("labels every one of them", () => {
    for (const alignment of ALIGNMENTS) expect(alignment.label).toBeTruthy();
  });
});

describe("resolveAlignment", () => {
  it("finds one the app ships", () => {
    expect(resolveAlignment("right").id).toBe("right");
  });

  it.each([
    ["nothing", null],
    ["undefined", undefined],
    ["an empty value", ""],
    ["one that does not exist", "justify"],
    ["something hostile", "__proto__"],
  ])("falls back to the default given %s", (_label, id) => {
    // A cookie value is arbitrary text until it matches something we ship.
    expect(resolveAlignment(id)).toBe(DEFAULT_ALIGNMENT);
  });
});

describe("what an alignment puts on <html>", () => {
  it("names the alignment in an attribute the stylesheet selects on", () => {
    expect(alignmentAttributes(resolveAlignment("center"))).toEqual({
      "data-note-align": "center",
    });
  });

  it("takes a miss, because the error boundary renders without a loader", () => {
    expect(alignmentAttributes(undefined)).toEqual({
      "data-note-align": DEFAULT_ALIGNMENT.id,
    });
  });
});

describe("the stylesheet backing it", () => {
  it.each(ALIGNMENTS.map((a) => a.id))(
    "declares --note-align for %s",
    (id) => {
      const block = css.match(
        new RegExp(`\\[data-note-align="${id}"\\][\\s\\S]*?\\{([^}]*)\\}`),
      );
      expect(block, `no [data-note-align="${id}"] block in app.css`).not.toBeNull();
      expect(block![1]).toContain("--note-align");
    },
  );

  it("aligns the note's text off that property rather than a fixed value", () => {
    // The fields are textareas: a form control does not inherit text-align
    // from an ancestor, so the rule has to reach them by name.
    expect(css).toMatch(/\.note-text[^{]*textarea[^{]*\{[^}]*text-align:\s*var\(--note-align\)/);
  });

  it("leaves the grid cards out of it", () => {
    /*
      The cards render the same `<Markdown>` component, and therefore the same
      `.markdown` class, as the open note. If the alignment rules were written
      against `.markdown` they would swing the library around too — so every
      one of them is scoped under `.note-text`, which only the open note has.
    */
    for (const rule of css.split("}")) {
      if (!rule.includes("--note-align") && !rule.includes("--note-block")) continue;
      if (rule.includes(":root") || rule.includes("[data-note-align=")) continue;
      expect(rule, `unscoped alignment rule: ${rule.trim()}`).toContain(".note-text");
    }
  });
});
