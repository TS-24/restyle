import { useState } from "react";
import { Form, Link, redirect, useFetcher } from "react-router";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { api, ApiError } from "~/lib/api.server";
import {
  ALIGNMENTS,
  applyAlignment,
  resolveAlignment,
  type Alignment,
} from "~/lib/alignment";
import { commitAlignment, getAlignment } from "~/lib/alignment.server";
import { requireToken } from "~/lib/session.server";
import { commitTheme, getTheme } from "~/lib/theme.server";
import { applyTheme, resolveTheme, THEMES, type Theme } from "~/lib/themes";
import type {
  AdminInvite,
  ConfiguredProvider,
  Invite,
  ProviderOption,
  ProviderSettings,
  ResetLink,
  User,
} from "~/lib/types";
import type { Route } from "./+types/menu";

export function meta() {
  return [{ title: "Account — Restyle" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const token = await requireToken(request);
  const [user, provider, invites] = await Promise.all([
    api.getCurrentUser(token),
    api.getProviderSettings(token),
    api.listInvites(token),
  ]);

  /*
    The two system-wide listings, or null. One field rather than two arrays and
    a boolean: "may this account see everything" and "here is everything" are
    the same fact, and split across three fields they could contradict each
    other. The flag on `user` decides whether to ask at all — the endpoints
    refuse on their own, so this only avoids a 403 the page has no use for.
  */
  const everyone = user.is_superuser
    ? await Promise.all([api.listAllInvites(token), api.listUsers(token)]).then(
        ([invites, users]) => ({ invites, users }),
      )
    : null;

  return {
    user,
    provider,
    invites,
    everyone,
    theme: await getTheme(request),
    alignment: await getAlignment(request),
  };
}

/**
 * Adding, checking, refreshing and forgetting the reader's provider keys.
 *
 * The key arrives in a form post, goes straight to the API client, and is never
 * put anywhere else — not in the loader's response, not in a redirect, not in a
 * log line. The backend does not send it back either, so there is no path by
 * which it can reach the page again, and it scrubs the key out of a provider's
 * own error before that error gets here.
 */
export async function action({ request }: Route.ActionArgs) {
  const token = await requireToken(request);
  const formData = await request.formData();

  /*
    The theme is a cookie, not an account setting, so it never reaches the API.
    Redirecting rather than returning data is the point: it makes the browser
    re-request the page with the new cookie already set, which re-runs the root
    loader and puts the palette on `<html>` the same way a cold load would.
  */
  if (formData.get("intent") === "theme") {
    return redirect("/settings", {
      headers: { "Set-Cookie": await commitTheme(String(formData.get("theme") ?? "")) },
    });
  }

  // Same bargain as the theme above, and a separate cookie: the two are
  // independent preferences and setting one must not disturb the other.
  if (formData.get("intent") === "align") {
    return redirect("/settings", {
      headers: {
        "Set-Cookie": await commitAlignment(String(formData.get("align") ?? "")),
      },
    });
  }

  const provider = String(formData.get("provider") ?? "");

  try {
    switch (formData.get("intent")) {
      /*
        Issuing a code returns only whether it worked. The code itself arrives
        on the page through the loader, which this submission revalidates — so
        there is one place it is rendered from, and it is a place that still has
        it on the next render. An action result is gone as soon as anything else
        is submitted, and a code that vanishes is a code reissued.
      */
      case "invite": {
        await api.issueInvite(token, String(formData.get("email") ?? ""));
        return { ok: true as const, message: "Code ready to send." };
      }
      /*
        The one thing on this page that has to come back in the action result
        rather than through the loader, and the reverse of the invite case
        above for a reason that is not style. Only the hash of a reset token is
        stored, so the loader has nothing to re-read: this response is the only
        moment the link exists anywhere the page can see it. That is also what
        makes the link worth showing at all — a database copy is not worth an
        account. Losing it before it is passed on costs one more click.
      */
      case "reset-link": {
        const link = await api.issueResetLink(
          token,
          String(formData.get("email") ?? ""),
        );
        return { ok: true as const, message: "Link ready to send.", link };
      }
      case "forget": {
        await api.forgetProviderKey(token, provider);
        return { ok: true as const, message: "Key forgotten." };
      }
      case "refresh": {
        const settings = await api.refreshProviderModels(token, provider);
        return { ok: true as const, message: countOf(settings, provider) };
      }
      default: {
        // Slow on purpose: the backend calls the provider before it stores
        // anything, and that wait is the check the dialog is asking the reader
        // to stay for.
        const settings = await api.saveProviderKey(
          token,
          provider,
          String(formData.get("api_key") ?? ""),
        );
        return { ok: true as const, message: `Connected. ${countOf(settings, provider)}` };
      }
    }
  } catch (error) {
    // The backend's own words, because they are the only thing that tells a
    // mistyped key from a spent quota from a provider that is down.
    if (error instanceof ApiError) return { ok: false as const, message: error.detail };
    throw error;
  }
}

/** "N models available", for whichever provider was just checked. */
function countOf(settings: ProviderSettings, provider: string) {
  const found = settings.configured.find(c => c.provider === provider)?.models.length ?? 0;
  return `${found} model${found === 1 ? "" : "s"} available.`;
}

/**
 * One eyebrow style, borrowed from the chat card, so a section here announces
 * itself the same way a card in the library does. It is the only label rank the
 * app has below a heading, and inventing a second would be inventing a second.
 */
const EYEBROW = "text-xs uppercase tracking-[0.14em] text-ink/45";

/** A panel: one step of paper tone, no border and no shadow (DESIGN.md §5). */
const PANEL = "rounded-2xl bg-paper-raised p-7 sm:p-8";

const FIELD =
  "mt-1.5 w-full border-b border-ink/15 bg-transparent py-2 outline-none transition-colors focus:border-accent-ink";

/**
 * Adding a key, as a dialog rather than as three fields on the page.
 *
 * The form this replaces sat in the middle of the settings column between a
 * palette picker and a sign-out button, which said that pasting a credential
 * for somebody else's paid account was that kind of change. It is not. A dialog
 * costs a deliberate click to open, takes the page away while it is up, and —
 * the part that matters — can refuse: the key is sent to the provider before it
 * is stored, and if the provider will not have it the dialog says so and stays
 * where it is. There is nowhere to move on to until it works.
 *
 * The reward for waiting is the model list, which is what the same call comes
 * back with, and what the picker in the chat is built from.
 */
function AddKeyDialog({
  available,
  open,
  onOpenChange,
}: {
  available: ProviderOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fetcher = useFetcher<{ ok: boolean; message: string }>();
  const checking = fetcher.state !== "idle";
  const done = fetcher.state === "idle" && fetcher.data?.ok === true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-tight">
            Add a provider key
          </DialogTitle>
          <DialogDescription className="leading-relaxed">
            The key is sent to the provider once, to check it works and to ask
            what it can reach. It is then stored encrypted and never shown again.
            Chats you start will be billed to that account, and on gateways the
            check itself costs a one-token request.
          </DialogDescription>
        </DialogHeader>

        <fetcher.Form method="post" autoComplete="off" data-key-form className="space-y-5">
          <input type="hidden" name="intent" value="save-key" />

          {/*
            Stacked in this order on purpose. Chrome reads "a text input
            immediately above a password input" as a sign-in form and fills the
            pair with the saved account credentials — which would have put the
            reader's Restyle password in the box they then save as an API key. A
            select is not a username, so the provider goes above the key.
          */}
          <label className="block">
            <span className="text-sm text-ink/60">Provider</span>
            <select name="provider" defaultValue={available[0]?.id} className={FIELD}>
              {available.map(option => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm text-ink/60">API key</span>
            <input
              type="password"
              name="api_key"
              required
              // Not a password the browser should remember or offer to fill: it
              // belongs to a third party, not to this site's account.
              autoComplete="new-password"
              spellCheck={false}
              className={FIELD}
            />
          </label>

          {fetcher.data ? (
            <p
              data-key-status
              role={fetcher.data.ok ? "status" : "alert"}
              className={`text-sm ${fetcher.data.ok ? "text-ink/60" : "text-danger"}`}
            >
              {fetcher.data.message}
            </p>
          ) : null}

          <div className="flex items-center gap-4 pt-1">
            <button
              type="submit"
              disabled={checking}
              className="rounded-xl bg-accent px-5 py-2 text-sm text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {checking ? "Checking…" : done ? "Save another" : "Check and save"}
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-sm text-ink/50 transition-colors hover:text-ink"
            >
              {done ? "Done" : "Cancel"}
            </button>
          </div>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One key on file: which provider, which key, and how much it can reach.
 *
 * Refresh is here rather than automatic because the list is a cache, and the
 * only thing that goes stale about it is a model added or retired since the key
 * was saved. One button is cheaper than a provider call on every page load, and
 * far cheaper than a picker that is empty whenever the provider is having a bad
 * morning.
 */
function ConfiguredRow({ credential }: { credential: ConfiguredProvider }) {
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle";

  return (
    <fetcher.Form method="post" className="flex items-center gap-3 py-2">
      <input type="hidden" name="provider" value={credential.provider} />
      <span className="min-w-0 flex-1 truncate text-sm text-ink">
        {credential.label}{" "}
        <span className="text-ink/50">····{credential.key_hint}</span>
      </span>
      <span className="shrink-0 text-xs text-ink/45">
        {credential.models.length} models
      </span>
      <button
        type="submit"
        name="intent"
        value="refresh"
        disabled={busy}
        className="shrink-0 text-xs text-ink/50 transition-colors hover:text-ink disabled:opacity-50"
      >
        Refresh
      </button>
      <button
        type="submit"
        name="intent"
        value="forget"
        disabled={busy}
        className="shrink-0 text-xs text-ink/50 transition-colors hover:text-danger disabled:opacity-50"
      >
        Forget
      </button>
    </fetcher.Form>
  );
}

/**
 * The palette picker.
 *
 * A plain `<select>` rather than a row of swatches: there are four of these and
 * there will be more, and a native control is the one thing that stays usable at
 * any length, on a phone, and by keyboard without any of it being written here.
 *
 * It submits on change, and `applyTheme` repaints immediately so the colours do
 * not wait on the post. The submit button is the no-JS path — without script the
 * change event still fires but nothing sends the form, so the button has to be
 * real rather than wrapped in `<noscript>`.
 */
function ThemePicker({ current }: { current: Theme }) {
  const fetcher = useFetcher();

  return (
    <fetcher.Form method="post" className="max-w-xs">
      <input type="hidden" name="intent" value="theme" />
      <label htmlFor="theme" className="text-sm text-ink/60">
        Palette
      </label>
      <select
        id="theme"
        name="theme"
        defaultValue={current.id}
        className={`${FIELD} cursor-pointer`}
        onChange={(event) => {
          applyTheme(resolveTheme(event.target.value));
          fetcher.submit(event.currentTarget.form);
        }}
      >
        {THEMES.map((theme) => (
          <option key={theme.id} value={theme.id}>
            {theme.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="mt-4 rounded-xl border border-ink/15 px-4 py-1.5 text-sm text-ink transition-colors hover:bg-paper"
      >
        Save
      </button>
    </fetcher.Form>
  );
}

/**
 * Which way a note's own text runs.
 *
 * Built like the palette picker beside it, and for the same reasons — a native
 * `<select>`, submitting on change, repainting immediately so the words do not
 * wait on the post, with a real Save button as the no-JS path.
 *
 * It is deliberately not a live preview of a note: the thing it changes is two
 * clicks away, and a swatch of fake prose here would be a second place for the
 * type scale to be wrong.
 */
function AlignmentPicker({ current }: { current: Alignment }) {
  const fetcher = useFetcher();

  return (
    <fetcher.Form method="post" className="max-w-xs">
      <input type="hidden" name="intent" value="align" />
      <label htmlFor="align" className="text-sm text-ink/60">
        Note text
      </label>
      <select
        id="align"
        name="align"
        defaultValue={current.id}
        className={`${FIELD} cursor-pointer`}
        onChange={(event) => {
          applyAlignment(resolveAlignment(event.target.value));
          fetcher.submit(event.currentTarget.form);
        }}
      >
        {ALIGNMENTS.map((alignment) => (
          <option key={alignment.id} value={alignment.id}>
            {alignment.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="mt-4 rounded-xl border border-ink/15 px-4 py-1.5 text-sm text-ink transition-colors hover:bg-paper"
      >
        Save
      </button>
    </fetcher.Form>
  );
}

/** A code, set in the mono face and selectable, beside who it is for. */
function InviteRow({ invite }: { invite: Invite }) {
  const spent = invite.used_at !== null;

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
      <div className="min-w-0 space-y-0.5">
        {/*
          `select-all` rather than a copy button alone: the clipboard API needs a
          secure context and a user gesture, and neither is guaranteed. One click
          selects the whole code, which works everywhere and is what someone
          reaching for it actually does.
        */}
        <code
          data-invite-code
          className={`select-all font-mono text-sm ${spent ? "text-ink/35 line-through" : "text-ink"}`}
        >
          {invite.code}
        </code>
        <p className="truncate text-xs text-ink/50">
          {invite.invited_email ?? "Anyone with the code"}
        </p>
      </div>
      <span className="text-xs text-ink/45">{spent ? "Used" : "Unused"}</span>
    </div>
  );
}

/**
 * Issuing a code, and the codes already issued.
 *
 * Unlimited on purpose: the people with accounts are the people already trusted
 * to be here, and a quota raised by hand is a support request waiting to happen.
 * What limits the damage instead is that a code names one address and works for
 * no other, so one that leaks is worth nothing to whoever finds it.
 */
function Invites({ invites }: { invites: Invite[] }) {
  const fetcher = useFetcher<{ ok: boolean; message: string }>();
  const sending = fetcher.state !== "idle";

  return (
    <section className={`${PANEL} space-y-6`}>
      <div className="space-y-2">
        <p className={EYEBROW}>Invites</p>
        <h2 className="font-display text-2xl tracking-tight">Invite someone</h2>
        <p className="text-sm leading-relaxed text-ink/60">
          Registration is invite-only. A code works once, and only for the
          address you issue it to. Nothing is emailed — send the code on
          yourself.
        </p>
      </div>

      <fetcher.Form method="post" data-invite-form className="space-y-3">
        <input type="hidden" name="intent" value="invite" />
        <label className="block">
          <span className="text-sm text-ink/60">Their email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="off"
            placeholder="friend@example.com"
            className={FIELD}
          />
        </label>
        <button
          type="submit"
          disabled={sending}
          className="rounded-xl bg-accent px-5 py-2 text-sm text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {sending ? "Creating…" : "Create invite"}
        </button>
        {fetcher.data ? (
          <p
            data-invite-status
            role={fetcher.data.ok ? "status" : "alert"}
            className={`text-sm ${fetcher.data.ok ? "text-ink/60" : "text-danger"}`}
          >
            {fetcher.data.message}
          </p>
        ) : null}
      </fetcher.Form>

      <div className="rounded-xl bg-paper px-4 py-2">
        {invites.length ? (
          <div className="divide-y divide-ink/10">
            {invites.map(invite => (
              <InviteRow key={invite.id} invite={invite} />
            ))}
          </div>
        ) : (
          <p className="py-2 text-sm italic text-ink/60">
            You have not invited anyone yet.
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Handing someone a way back into their own account.
 *
 * The link is shown once, here, and never again: only its hash is stored, so
 * there is no listing to come back to. That is the trade — an invite code can
 * be re-read forever because it is worth one new account bound to one address,
 * while this is worth an account that already exists, with someone's notes in
 * it. Reissuing is free, so the link that scrolls away costs a click.
 *
 * Superuser-only for the same reason. Issuing an invite is offering someone a
 * door; issuing this is handing over a room.
 */
function ResetLinks() {
  const fetcher = useFetcher<{ ok: boolean; message: string; link?: ResetLink }>();
  const working = fetcher.state !== "idle";
  const link = fetcher.data?.ok ? fetcher.data.link : undefined;

  return (
    <div data-reset-links className="space-y-3">
      <p className={EYEBROW}>Password reset</p>
      <p className="text-sm leading-relaxed text-ink/60">
        Issue a one-time link for an account that cannot sign in. Nothing is
        emailed — pass it on yourself, as with a code. It works once, and a new
        link retires the last one.
      </p>

      <fetcher.Form method="post" data-reset-form className="space-y-3">
        <input type="hidden" name="intent" value="reset-link" />
        <label className="block">
          <span className="text-sm text-ink/60">Their email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="off"
            placeholder="friend@example.com"
            className={FIELD}
          />
        </label>
        <button
          type="submit"
          disabled={working}
          className="rounded-xl border border-ink/15 px-5 py-2 text-sm transition-colors hover:bg-ink/5 disabled:opacity-50"
        >
          {working ? "Issuing…" : "Issue reset link"}
        </button>
        {fetcher.data && !fetcher.data.ok ? (
          <p data-reset-status role="alert" className="text-sm text-danger">
            {fetcher.data.message}
          </p>
        ) : null}
      </fetcher.Form>

      {link ? (
        <div className="space-y-1.5 rounded-xl bg-paper px-4 py-3">
          <p data-reset-status role="status" className="text-xs text-ink/50">
            For {link.email}. Valid once, for {link.expires_in_minutes} minutes.
            Copy it now — it is not shown again.
          </p>
          {/*
            `select-all` rather than a copy button alone, as InviteRow does: the
            clipboard API needs a secure context and a gesture, and one click
            selecting the whole thing works everywhere. `break-all` because a
            URL with a token in it has no spaces to wrap at.
          */}
          <code
            data-reset-link
            className="block select-all font-mono text-xs break-all text-ink"
          >
            {link.url}
          </code>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The two listings that cover everybody, and the one action on them, for the
 * account that holds the flag. Otherwise read-only: there is nothing to revoke
 * here and nothing to promote, because neither has been asked for and both are
 * easy to add later.
 */
function Everyone({
  invites,
  users,
}: {
  invites: AdminInvite[];
  users: User[];
}) {
  return (
    <section className={`${PANEL} space-y-6`}>
      <div className="space-y-2">
        <p className={EYEBROW}>Everyone</p>
        <h2 className="font-display text-2xl tracking-tight">The whole system</h2>
        <p className="text-sm leading-relaxed text-ink/60">
          Every account, and every code anyone has issued. Only you can see
          this.
        </p>
      </div>

      <ResetLinks />

      <div data-every-account className="space-y-2">
        <p className={EYEBROW}>Accounts</p>
        <div className="divide-y divide-ink/10 rounded-xl bg-paper px-4 py-2">
          {users.map(each => (
            <div
              key={each.id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 py-2.5"
            >
              <span className="truncate text-sm text-ink">{each.email}</span>
              <span className="text-xs text-ink/45">
                {each.is_superuser ? "Superuser" : each.username}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div data-every-invite className="space-y-2">
        <p className={EYEBROW}>Invites</p>
        <div className="divide-y divide-ink/10 rounded-xl bg-paper px-4 py-2">
          {invites.length ? (
            invites.map(invite => (
              <div key={invite.id} className="space-y-0.5 py-2.5">
                <p className="truncate text-sm text-ink">
                  {invite.invited_email ?? "Anyone with the code"}
                </p>
                <p className="text-xs text-ink/50">
                  {/* Who issued it, and who spent it. A code from the CLI has
                      no issuer, which is what "the command line" says here. */}
                  from {invite.issued_by_email ?? "the command line"}
                  {invite.used_by_email ? ` · used by ${invite.used_by_email}` : " · unused"}
                </p>
              </div>
            ))
          ) : (
            <p className="py-2 text-sm italic text-ink/60">No codes issued.</p>
          )}
        </div>
      </div>
    </section>
  );
}

export default function Menu({ loaderData }: Route.ComponentProps) {
  const { user, provider, invites, everyone, theme, alignment } = loaderData;
  const [adding, setAdding] = useState(false);
  const initial = (user.username || user.email).trim().charAt(0).toUpperCase();

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-8 py-12">
      {/* The exit sits at the head of the column, at Meta size — DESIGN.md's
          form for leaving a view, in place of a back button or a rail. */}
      <Link to="/notes" className="block text-sm tracking-wide text-ink/50 transition-colors hover:text-ink">
        ← Your notes
      </Link>

      {/*
        A title and a line saying what the page is for. The page was a stack of
        sections that all began at the same weight, so nothing said where to
        start reading; giving the head of the column its own rank is what makes
        the rest of it a list of things rather than one long thing.
      */}
      <header className="space-y-2">
        <p className={EYEBROW}>Settings</p>
        <h1 className="font-display text-4xl tracking-tight">Account</h1>
        <p className="text-ink/60">
          Who you are signed in as, and the provider your conversations run on.
        </p>
      </header>

      {/* Identity, as a card rather than a caption: it is the answer to the
          first question anyone opens this page with. */}
      <section className={`${PANEL} flex items-center gap-4`}>
        <span
          aria-hidden
          className="flex size-12 shrink-0 items-center justify-center rounded-full border border-ink/15 bg-paper font-display text-lg text-ink/70"
        >
          {initial}
        </span>
        <div className="min-w-0">
          <p className="truncate font-display text-lg text-ink">{user.username}</p>
          <p className="truncate text-sm text-ink/60">{user.email}</p>
        </div>
      </section>

      {/* Appearance before the provider key: it is the section someone is far
          more likely to have come here to change. */}
      <section className={`${PANEL} space-y-6`}>
        <div className="space-y-2">
          <p className={EYEBROW}>Appearance</p>
          <h2 className="font-display text-2xl tracking-tight">
            Theme and layout
          </h2>
          <p className="text-sm leading-relaxed text-ink/60">
            Both apply to this browser. Paper is the palette the app was drawn
            in; the rest are ports of colour schemes you may already read code
            in. Note text sets which way an open note runs — centred is how the
            app was drawn, flush left is the easier of the two to read at
            length.
          </p>
        </div>

        <div className="flex flex-wrap gap-x-12 gap-y-6">
          <ThemePicker current={theme} />
          <AlignmentPicker current={alignment} />
        </div>
      </section>

      <section className={`${PANEL} space-y-6`}>
        <div className="space-y-2">
          <p className={EYEBROW}>Conversations</p>
          <h2 className="font-display text-2xl tracking-tight">AI providers</h2>
          <p className="text-sm leading-relaxed text-ink/60">
            Chats run on your own account with whichever provider you pick. Keys
            are stored encrypted and are never shown again after you add them.
            Which model a chat uses is chosen in the chat itself.
          </p>
        </div>

        {/* What is on file, set apart from the prose above it so the state of
            the account reads at a glance rather than in a sentence. */}
        <div className="rounded-xl bg-paper px-4 py-3">
          {provider.configured.length ? (
            <>
              <div className="divide-y divide-ink/10">
                {provider.configured.map(credential => (
                  <ConfiguredRow key={credential.provider} credential={credential} />
                ))}
              </div>
              {provider.active ? (
                <p className="mt-3 text-xs text-ink/45">
                  Chatting with <span className="text-ink/70">{provider.active.provider}</span>{" "}
                  · <span className="text-ink/70">{provider.active.model}</span>
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm italic text-ink/60">
              No keys on file. Chats will ask you for one.
            </p>
          )}
        </div>

        <button
          type="button"
          data-add-key
          onClick={() => setAdding(true)}
          className="rounded-xl bg-accent px-5 py-2 text-sm text-on-accent transition-opacity hover:opacity-90"
        >
          Add a key
        </button>

        <AddKeyDialog
          available={provider.available}
          open={adding}
          onOpenChange={setAdding}
        />
      </section>

      <Invites invites={invites} />

      {everyone ? (
        <Everyone invites={everyone.invites} users={everyone.users} />
      ) : null}

      {/* A form rather than a link: signing out is a POST so that a prefetch
          or a crawler cannot end the session. */}
      <section className={`${PANEL} space-y-4`}>
        <div className="space-y-2">
          <p className={EYEBROW}>Session</p>
          <p className="text-sm text-ink/60">
            Signs out this browser only. Anywhere else you are signed in stays
            signed in.
          </p>
        </div>
        <Form method="post" action="/logout">
          <button
            type="submit"
            className="rounded-xl border border-ink/15 px-5 py-2 text-sm transition-colors hover:bg-ink/5"
          >
            Sign out
          </button>
        </Form>
      </section>
    </main>
  );
}
