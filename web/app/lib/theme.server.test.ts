import { describe, expect, it } from "vitest";

import { DEFAULT_THEME } from "./themes";
import { commitTheme, getTheme, THEME_COOKIE } from "./theme.server";

/** A request carrying whatever the browser would have sent. */
function requestWith(cookie: string | null): Request {
  return new Request("https://example.test/", {
    headers: cookie === null ? {} : { Cookie: cookie },
  });
}

describe("getTheme", () => {
  it("reads a theme the app ships", async () => {
    const request = requestWith(await commitTheme("nord"));
    expect((await getTheme(request)).id).toBe("nord");
  });

  it.each([
    ["no cookie header at all", null],
    ["an unrelated cookie", "__session=abc"],
    ["an empty value", `${THEME_COOKIE}=`],
    ["a theme that does not exist", `${THEME_COOKIE}=dracula`],
    ["something hostile", `${THEME_COOKIE}=__proto__`],
  ])("falls back to the default given %s", async (_label, cookie) => {
    expect(await getTheme(requestWith(cookie))).toBe(DEFAULT_THEME);
  });
});

describe("commitTheme", () => {
  it("produces a Set-Cookie the browser will send back", async () => {
    const header = await commitTheme("nord");
    expect(header).toMatch(new RegExp(`^${THEME_COOKIE}=`));
    expect(header).toContain("Path=/");
  });

  it("is readable by script, unlike the session cookie", async () => {
    // A preference, not a credential: HttpOnly would protect nothing here.
    expect(await commitTheme("nord")).not.toContain("HttpOnly");
  });

  it("rejects a theme it does not ship rather than writing it", async () => {
    expect(await commitTheme("dracula")).toBe(await commitTheme(DEFAULT_THEME.id));
  });
});
