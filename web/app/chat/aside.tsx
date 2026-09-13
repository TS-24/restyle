import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { CornerDownLeft, X } from "lucide-react";

import Markdown from "~/notes/markdown";
import { ANSWER_TONE } from "~/chat/chat-surface";
import type { AsideTurn } from "~/lib/types";

/**
 * The "btw": a question asked beside the conversation and kept out of it.
 *
 * A note has one thread and no way to start a second, and that thread is what
 * gets summarised into the note. So there was nowhere to put a passing question
 * that did not also put it into the record of what the conversation was about.
 * This is that nowhere.
 *
 * The turns live here, in component state, and nowhere else: the route it posts
 * to stores nothing and hands back only an answer. Unmounting the panel is
 * therefore not a "close" that could be undone — it is the discard, and the
 * copy says so before anything is typed rather than after.
 *
 * It is still answered in the conversation's context; the server adds the
 * transcript. An aside stripped of what it is an aside from would just be a
 * second chat window drawn over the first.
 */
export default function Aside({
  chatId,
  onDiscard,
}: {
  chatId: number;
  /** Throws the aside away. The only way out, and there is no way back in. */
  onDiscard: () => void;
}) {
  const asker = useFetcher();
  const [turns, setTurns] = useState<AsideTurn[]>([]);
  const [draft, setDraft] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);

  const pending = asker.state !== "idle";
  const error =
    asker.data && !(asker.data as { ok: boolean }).ok
      ? (asker.data as { error: string }).error
      : null;

  /*
    The answer is folded into the transcript when it lands, and the question
    that earned it goes in beside it.

    Both at once rather than the question on submit: a refusal must leave the
    aside as it was, so there is nothing half-asked to resend or explain. Same
    rule the real conversation is written to on the server, for the same reason.

    The question is kept in a ref rather than read back off the fetcher: react
    router drops `formData` the moment the fetcher goes idle, which is the same
    render the answer arrives on, so by the time there is something to pair the
    question with it is already gone.

    Also guarded against the fetcher's data outliving the request, which would
    otherwise append the same answer on every later render.
  */
  const asked = useRef<string | null>(null);
  const taken = useRef<unknown>(null);
  useEffect(() => {
    const data = asker.data as { ok?: boolean; content?: string } | undefined;
    if (pending || !data?.ok || !data.content || taken.current === data) return;
    taken.current = data;
    const question = asked.current;
    asked.current = null;
    setTurns(prev => [
      ...prev,
      ...(question ? [{ role: "user" as const, content: question }] : []),
      { role: "assistant" as const, content: data.content! },
    ]);
  }, [pending, asker.data]);

  /*
    A refused aside hands its words back, the way the conversation's composer
    does. There is no transcript to recover it from here — a lost paragraph is
    lost outright — so this matters more in the panel than it does out there.
  */
  const handedBack = useRef(false);
  useEffect(() => {
    if (pending) {
      handedBack.current = false;
      return;
    }
    if (!error || handedBack.current) return;
    handedBack.current = true;
    const question = asked.current;
    asked.current = null;
    if (question) setDraft(prev => [question, prev.trim()].filter(Boolean).join("\n\n"));
  }, [pending, error]);

  useEffect(() => {
    field.current?.focus();
  }, []);

  const ask = () => {
    const content = draft.trim();
    if (!content || pending) return;
    setDraft("");
    asked.current = content;
    asker.submit(
      { intent: "aside", content, history: JSON.stringify(turns) },
      { method: "post", action: `/chats/${chatId}` },
    );
  };

  /*
    The question in flight is shown from the moment it is sent, though it is not
    in `turns` until the answer arrives. Without it the words vanish on Enter
    and nothing takes their place until the model has finished thinking.
  */
  const inFlight = pending ? asker.formData?.get("content") : null;
  const shown: AsideTurn[] = [
    ...turns,
    ...(typeof inFlight === "string"
      ? [{ role: "user" as const, content: inFlight }]
      : []),
  ];

  return (
    <section
      aria-label="Aside"
      /*
        Marked out by space and by the tone of its ink, per DESIGN.md §5 — no
        box and no rule. A border here would be the thing telling you this half
        of the screen is different, which is type's job.
      */
      className="mt-6 flex flex-col gap-4"
      onKeyDown={event => {
        // Escape closes the aside, not the conversation. The surface's own
        // handler sits on `document` and defers to a handled key, so marking
        // this one handled is what keeps the chat open behind it.
        if (event.key !== "Escape") return;
        event.preventDefault();
        onDiscard();
      }}
    >
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-sm italic text-ink/45">
          By the way — nothing here is saved, and none of it is summarised into
          your note.
        </p>
        <button
          type="button"
          onClick={onDiscard}
          aria-label="Discard this aside"
          title="Discard this aside"
          className="shrink-0 rounded-lg p-1.5 text-ink/40 transition-colors hover:text-ink cursor-pointer"
        >
          <X className="size-4" />
        </button>
      </div>

      {shown.length > 0 && (
        <div
          className="flex flex-col gap-4 overflow-y-auto"
          style={{ maxHeight: "28vh" }}
        >
          {shown.map((turn, i) => (
            <div
              key={i}
              className={turn.role === "user" ? "self-end" : "self-start"}
            >
              {turn.role === "user" ? (
                <p className="max-w-[68ch] whitespace-pre-line text-base leading-relaxed text-ink/60">
                  {turn.content}
                </p>
              ) : (
                /* The same ground the conversation's own answers stand on, so
                   an answer reads as an answer in both places. What separates
                   the aside is the space around it and the meta line above. */
                <div
                  style={{ backgroundColor: ANSWER_TONE }}
                  className="max-w-[76ch] rounded-3xl px-6 py-4 text-base leading-relaxed text-ink/75"
                >
                  <Markdown>{turn.content}</Markdown>
                </div>
              )}
            </div>
          ))}
          {pending && (
            <p className="self-start text-sm italic text-ink/40">Thinking…</p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-accent-ink">
          {error}
        </p>
      )}

      <div className="relative w-full">
        <textarea
          ref={field}
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key !== "Enter" || event.shiftKey) return;
            event.preventDefault();
            ask();
          }}
          rows={1}
          placeholder="btw…"
          aria-label="Your aside"
          style={{ maxHeight: "20vh", overflowY: "auto" }}
          className="block w-full resize-none rounded-2xl bg-paper px-5 py-3 pr-14 font-sans text-base leading-relaxed text-ink caret-accent-ink outline-none placeholder:text-ink/30"
        />
        <button
          type="button"
          onClick={ask}
          disabled={draft.trim().length === 0 || pending}
          aria-label="Send aside"
          title="Send aside"
          className="absolute bottom-2.5 right-3 rounded-xl p-2 text-ink/45 transition-colors hover:text-ink disabled:opacity-30 disabled:hover:text-ink/45 cursor-pointer disabled:cursor-default"
        >
          <CornerDownLeft className="size-4" />
        </button>
      </div>
    </section>
  );
}
