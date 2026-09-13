/**
 * The answer's ground must not be the ground it sits on.
 *
 * This is the regression, and it is worth stating exactly. The conversation
 * used to have a full-page mode whose ground was `--paper`, so an answer on
 * `--muted` — which every palette defines as `--paper-raised` — was one visible
 * step up from it. Deleting that mode left the conversation always in its box,
 * and the box is `--paper-raised`. The answer's ground and the surface's became
 * the same colour, on all seven palettes, and the replies went invisible.
 *
 * `message-tone.test.tsx` could not see it: it asserts the two speakers carry
 * different `data-variant`s, which stayed true the whole time. Nothing was
 * wrong with the variants — the two *colours behind them* had converged.
 *
 * What this can check is that the two values are still different values. That
 * is precisely the mistake that was made, so it is worth a test, but it is not
 * a claim about how they look: jsdom has no stylesheet and `color-mix` is
 * resolved by the browser. The eye and DESIGN.md §5 own the rest, and the
 * measured before/after is in the pull request.
 */
import { expect, test } from "vitest";

import { ANSWER_TONE, SURFACE_TONE } from "~/chat/chat-surface";

test("the answer's ground differs from the surface's", () => {
  expect(ANSWER_TONE).not.toBe(SURFACE_TONE);
});

test("the answer's ground is not simply the surface token under another name", () => {
  // `--muted` resolving to `--paper-raised` is how the two converged the first
  // time: not a shared literal, a shared *destination*. A value that is only
  // the surface token wrapped in whitespace or a var() would pass the test
  // above and be the same bug.
  expect(ANSWER_TONE.replace(/\s+/g, "")).not.toBe(SURFACE_TONE.replace(/\s+/g, ""));
  expect(ANSWER_TONE).not.toBe("var(--color-paper-raised)");
  expect(ANSWER_TONE).not.toBe("var(--muted)");
});

test("the answer's ground is derived from the palette rather than a fixed colour", () => {
  // Seven palettes, each with a dark counterpart. A literal here would be right
  // on one of them — see app/lib/no-hardcoded-colours.test.ts, which is the
  // same rule for stylesheets.
  expect(ANSWER_TONE).toMatch(/var\(--/);
  expect(ANSWER_TONE).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  expect(ANSWER_TONE).not.toMatch(/\brgba?\(/);
});
