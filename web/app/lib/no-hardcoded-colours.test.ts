import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Nothing in the app may name a colour directly.
 *
 * Every palette Restyle ships apart from Paper is dark, so a stray
 * `text-zinc-500` is not merely off-brand any more: on Nord's ground it is a
 * paragraph nobody can read, and it will not show up in a test that only checks
 * the DOM. This is the regression net for that — the cheapest way to keep the
 * sweep from being undone one paste at a time.
 *
 * The fix for a failure here is a role token from `app/themes.css`: `text-ink`
 * and its opacities for text, `text-danger`, `text-success`, `bg-scrim`.
 */
const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|" +
  "teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black";

const UTILITY = new RegExp(
  `\\b(?:bg|text|border|ring|from|via|to|divide|placeholder|fill|stroke|caret|outline|decoration|shadow)-(?:${PALETTE})(?:-\\d{2,3})?(?:\\/\\d+)?\\b`,
  "g",
);

const root = fileURLToPath(new URL("../", import.meta.url));

/**
 * shadcn's own files are vendored, not written here. They are on the semantic
 * ramp (`bg-background`, `border-input`), which `app.css` repoints at the role
 * tokens, so they follow a theme without being rewritten.
 */
const ALLOWED = new Set<string>(["components/ui/sidebar.tsx"]);

/**
 * Hand-rolled rather than `fs.globSync`, which needs Node 22. CI and the
 * Dockerfile both pin Node 20, where that call does not exist at all — and the
 * host runs 26, so the failure only ever shows up in CI.
 */
function tsxFilesUnder(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = prefix + entry.name;
    if (entry.isDirectory()) return tsxFilesUnder(`${dir}${entry.name}/`, `${rel}/`);
    return entry.name.endsWith(".tsx") ? [rel] : [];
  });
}

describe("no hardcoded colours", () => {
  const files = tsxFilesUnder(root).filter((f) => !ALLOWED.has(f));

  it("finds files to check", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files)("%s uses only role tokens", (file) => {
    const hits = readFileSync(root + file, "utf8").match(UTILITY) ?? [];
    expect([...new Set(hits)]).toEqual([]);
  });
});
