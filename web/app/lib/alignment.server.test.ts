import { describe, expect, it } from "vitest";

import { DEFAULT_ALIGNMENT } from "./alignment";
import { ALIGN_COOKIE, commitAlignment, getAlignment } from "./alignment.server";

/** A request carrying whatever the browser would have sent. */
function requestWith(cookie: string | null): Request {
  return new Request("https://example.test/", {
    headers: cookie === null ? {} : { Cookie: cookie },
  });
}

describe("getAlignment", () => {
  it("reads an alignment the app ships", async () => {
    const request = requestWith(await commitAlignment("right"));
    expect((await getAlignment(request)).id).toBe("right");
  });

  it("is read from its own cookie, not the theme's", async () => {
    // Two preferences, two cookies: changing the palette must not reset how
    // the note is aligned, and vice versa.
    expect(ALIGN_COOKIE).not.toBe("__theme");
    const request = requestWith(`__theme=nord; ${await commitAlignment("center")}`);
    expect((await getAlignment(request)).id).toBe("center");
  });

  it.each([
    ["no cookie header at all", null],
    ["an unrelated cookie", "__session=abc"],
    ["an empty value", `${ALIGN_COOKIE}=`],
    ["an alignment that does not exist", `${ALIGN_COOKIE}=justify`],
    ["something hostile", `${ALIGN_COOKIE}=__proto__`],
  ])("falls back to the default given %s", async (_label, cookie) => {
    expect(await getAlignment(requestWith(cookie))).toBe(DEFAULT_ALIGNMENT);
  });
});

describe("commitAlignment", () => {
  it("produces a Set-Cookie the browser will send back", async () => {
    const header = await commitAlignment("right");
    expect(header).toMatch(new RegExp(`^${ALIGN_COOKIE}=`));
    expect(header).toContain("Path=/");
  });

  it("is readable by script, unlike the session cookie", async () => {
    // A preference, not a credential: HttpOnly would protect nothing here,
    // and `applyAlignment` needs the client to be able to act on it.
    expect(await commitAlignment("right")).not.toContain("HttpOnly");
  });

  it("rejects an alignment it does not ship rather than writing it", async () => {
    expect(await commitAlignment("justify")).toBe(
      await commitAlignment(DEFAULT_ALIGNMENT.id),
    );
  });
});
