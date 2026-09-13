import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_THEME,
  THEME_ROLES,
  THEMES,
  resolveTheme,
  themeAttributes,
} from "./themes";

/**
 * The palettes are CSS and the registry is TypeScript, so nothing but this file
 * stops the two drifting apart. It reads `themes.css` as text rather than
 * importing it: the point is to check what ships to the browser, and a bundler
 * would happily resolve an `@import` this never sees.
 */
const source = readFileSync(fileURLToPath(new URL("../themes.css", import.meta.url)), "utf8");

/** Comments in that file document the `[data-theme="id"]` shape, so scanning the
 *  raw text would find palettes that are only examples. */
const css = source.replace(/\/\*[\s\S]*?\*\//g, "");

/** The declarations inside one `[data-theme="id"] { ... }` block. */
function blockFor(id: string): string | null {
  const match = css.match(new RegExp(`\\[data-theme="${id}"\\]\\s*\\{([^}]*)\\}`));
  return match ? match[1] : null;
}

describe("theme registry", () => {
  it("has unique ids", () => {
    const ids = THEMES.map((theme) => theme.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("defaults to a theme it actually ships", () => {
    expect(THEMES).toContain(DEFAULT_THEME);
  });

  it.each(THEMES)("$id has a block in themes.css", ({ id }) => {
    expect(blockFor(id)).not.toBeNull();
  });

  it.each(THEMES)("$id defines every role", ({ id }) => {
    const block = blockFor(id) ?? "";
    const missing = THEME_ROLES.filter((role) => !block.includes(`--${role}:`));
    expect(missing).toEqual([]);
  });

  it.each(THEMES)("$id declares its own color-scheme", ({ id }) => {
    // Without this a dark palette keeps light scrollbars and form controls.
    const block = blockFor(id) ?? "";
    expect(block).toMatch(/color-scheme:\s*(light|dark)/);
  });

  it("has no palette in the CSS that the registry does not know about", () => {
    const declared = [...css.matchAll(/\[data-theme="([^"]+)"\]/g)].map((m) => m[1]);
    const known = new Set(THEMES.map((theme) => theme.id));
    expect([...new Set(declared)].filter((id) => !known.has(id))).toEqual([]);
  });
});

describe("resolveTheme", () => {
  it("returns the named theme", () => {
    expect(resolveTheme("nord").id).toBe("nord");
  });

  it.each([null, undefined, "", "  ", "not-a-theme", "__proto__"])(
    "falls back to the default for %j",
    (value) => {
      expect(resolveTheme(value)).toBe(DEFAULT_THEME);
    },
  );
});

describe("themeAttributes", () => {
  it("names the theme on the element", () => {
    expect(themeAttributes(resolveTheme("nord"))["data-theme"]).toBe("nord");
  });

  it("adds the dark class for a dark theme, so shadcn's dark: rules fire", () => {
    expect(themeAttributes(resolveTheme("nord")).className).toBe("dark");
  });

  it("leaves the class off a light theme", () => {
    expect(themeAttributes(resolveTheme("paper")).className).toBeUndefined();
  });

  it("falls back to the default when there is no loader data", () => {
    // Layout renders for the ErrorBoundary too, where the root loader never ran.
    expect(themeAttributes(undefined)["data-theme"]).toBe(DEFAULT_THEME.id);
  });
});
