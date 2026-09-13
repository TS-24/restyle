import { useEffect, useState } from "react";

/**
 * A timestamp in the reader's own timezone, without a hydration mismatch.
 *
 * The problem this exists for: the app server renders in the container's zone
 * (UTC) and the browser renders in the reader's, so `Intl.DateTimeFormat` on a
 * card produced "Aug 20, 2026, 2:41 AM" on the server and "Aug 19, 2026,
 * 10:41 PM" on the client. React calls that a text mismatch and throws
 * hydration error #418 on every visit to the library.
 *
 * The fix is to make both sides agree on the *first* render and correct
 * afterwards. Server and hydration both format in UTC — identical strings, so
 * nothing to mismatch — and the effect, which only ever runs in the browser,
 * re-renders in the local zone.
 *
 * Rendering nothing on the server would also silence it, and would make every
 * card jump as the dates appeared. This way the text is there from the first
 * paint and only its value settles.
 */
export default function LocalTime({
  value,
  options = { dateStyle: "medium", timeStyle: "short" },
}: {
  /** An ISO 8601 timestamp, as every API date here is. */
  value: string;
  options?: Intl.DateTimeFormatOptions;
}) {
  // undefined means "the browser's own zone" to Intl, which is exactly what is
  // wanted once there is a browser to ask.
  const [timeZone, setTimeZone] = useState<string | undefined>("UTC");
  useEffect(() => setTimeZone(undefined), []);

  const date = new Date(value);
  return (
    // The machine-readable value never changes, so a copy or a crawl gets the
    // real instant regardless of which zone was rendered.
    <time dateTime={value}>
      {new Intl.DateTimeFormat("en-US", { ...options, timeZone }).format(date)}
    </time>
  );
}
