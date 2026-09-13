// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { applyTheme, resolveTheme } from "./themes";

/**
 * The picker paints the new palette before the server round trip finishes, so
 * this has to put the element into exactly the state the next server render
 * will, `dark` class included. If the two disagree the theme flips twice.
 */
describe("applyTheme", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.className = "";
  });

  it("names the theme on the root element", () => {
    applyTheme(resolveTheme("everforest"));
    expect(document.documentElement.dataset.theme).toBe("everforest");
  });

  it("adds the dark class for a dark theme", () => {
    applyTheme(resolveTheme("nord"));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("removes the dark class again when switching back to a light theme", () => {
    applyTheme(resolveTheme("nord"));
    applyTheme(resolveTheme("paper"));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.dataset.theme).toBe("paper");
  });

  it("leaves unrelated classes alone", () => {
    document.documentElement.className = "js-enabled";
    applyTheme(resolveTheme("nord"));
    expect(document.documentElement.classList.contains("js-enabled")).toBe(true);
  });
});
