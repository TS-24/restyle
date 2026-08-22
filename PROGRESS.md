# Restyle — Progress Log

Working context for whoever picks this up next. Read this before touching the
UI; a lot of what looks like odd code here is load-bearing, and the reasons are
recorded in [Traps](#traps-do-not-re-litigate-these).

Companion documents:

- [DESIGN.md](DESIGN.md) — the visual and navigation direction. Its §12 tracks
  what is applied and what is still outstanding.
- [README.md](README.md) — what the app is, the API, and setup.

Last updated: 2026-08-20 · branch `feature/three-more-palettes`. Since #34 this
has taken on #36 (compact grid cards), #37 (a new element per note), #39 (Neon),
#40 (palettes), the three extra palettes, and per-provider keys with a model
picker in the chat. `master` is well behind and stale; `prod` is older still.
Checking out an older branch is dangerous — see traps 22 and 24.

This whole file was re-checked against the code on 2026-08-20, and several
entries that had gone stale were corrected rather than left as history. Where an
item was simply *done*, it says so instead of being deleted, because the reason
it existed is often still worth reading.

**This repo is worked on by more than one session at a time.** During this
session another one committed into the shared working tree, and its commits
briefly landed on this branch. Check `git branch --show-current` and
`git status` immediately before staging, and stage files by name rather than
with `git add -A`.

---

## 1. What this app is

A notes app with a vocabulary-study angle. Two surfaces, one object:

- **`/` — the note.** The most recently touched note, set as a full-page hero.
  Live and editable. This is the landing page.
- **`/notes` — the library.** The same note, wrapped in a box, with the grid of
  every other note beneath it. `?open=<id>` says which note is open.

Double clicking the note toggles between the two, in both directions. That
gesture is the only navigation — there is no sidebar, nav bar, or exit link.

Since #34 there is a **second object**: an AI chat, started from a twin of the
`+` ghost card and opened as a boxed overlay on the library at `/notes?chat=<id>`,
morphing out of its card the way a note does. It runs on a provider API key the
reader supplies on `/settings`, and finishing one writes a three-part summary
that becomes what its card in the library shows. It is *not* a note and does
not share the note surface — see §3.

Since #40 there is also a **palette**, chosen on `/settings` and held in a
cookie the root loader reads. Seven of them, five dark. Every colour in the app
now goes through one of ten role tokens, and a test fails the build if a
component names a Tailwind colour instead — see §3.

---

## 2. Stack and how to run it

| Piece | What |
| --- | --- |
| Frontend | React Router v7 (SSR), TypeScript, Tailwind v4, framer-motion |
| Backend | FastAPI, SQLAlchemy, Alembic |
| DB | Neon (hosted Postgres) |
| Orchestration | `docker compose` — `frontend`, `backend` |

```bash
docker compose up -d --build
```

Frontend on `:3700`, API on `:8700` from the host (`FRONTEND_PORT` /
`BACKEND_PORT`); inside the compose network they are still `:3000` and `:8000`.
The backend entrypoint runs `alembic upgrade head` before uvicorn. The database
is Neon, so there is no `db` service and no healthcheck gate.

**There is Node on the host now, and `npm run typecheck` / `npm test` /
`npm run build` all work there** — that is the fast path, and it is what CI
runs. What the host cannot tell you is whether something works on **Node 20**,
which is what CI and the image pin while the host is newer; `jsdom` is held
below 30 for exactly that reason. To check that, install linux deps in a
container — *not* by mounting the host's `node_modules`, which holds
platform-specific bindings (trap 34):

```bash
docker run --rm -v "$PWD/frontend":/src -w /work node:20-alpine sh -c '
  cp /src/package.json /src/package-lock.json /src/tsconfig.json \
     /src/react-router.config.ts /src/vite.config.ts /work/
  npm ci --no-audit --no-fund >/dev/null 2>&1
  cp -r /src/app /work/app
  node_modules/.bin/react-router typegen && node_modules/.bin/tsc
'
```

Copying `app/` rather than mounting it keeps the generated `.react-router/types`
and the linux `node_modules` out of the host tree. Takes a couple of minutes.
Confirm it really checked your files with `tsc --listFiles | grep app/`: a
typegen that silently did nothing still exits 0.

To add a dependency without touching the host's `node_modules`:

```bash
docker run --rm -v "$PWD/frontend":/app -w /app node:20-alpine npm install --package-lock-only --save <pkg>
```

There is no `backend/venv` any more. Backend work runs either in the container
(`docker compose exec backend …`) or from `backend/.venv-test`, which is
gitignored, built with `uv`, and what the 296 tests were last run from.

---

## 3. Architecture — the part that matters

### The persistent note surface

`/` and `/notes` are **children of a layout route**. React Router keeps a parent
mounted while its children change, so the note survives navigation between the
two pages. This is the single most important structural fact in the app.

```
layout("routes/workspace.tsx")   ← owns the note surface; never unmounts
├── index  "routes/home.tsx"     ← landing mode (renders null)
└── route  "notes"               ← library mode (renders the grid)

route("chats")                   ← action only: create / delete a chat
route("chats/:chatId")           ← one conversation, its own page
```

The two chat routes are **outside** the layout on purpose, like `/analytics`
and `/settings`. The layout exists to keep one note surface mounted across a
navigation and it renders that surface for whichever *note* is focused; nesting
a conversation inside it would put a note on screen underneath the chat.

Because the title and body are literally the same DOM nodes on both pages,
opening a note is not a page swap — a box animates in around text that stays
put. Every difference between the two modes (padding, background, shadow,
min-height, type size) is a value on that one element.

**Do not** try to make the two pages *resemble* each other with matching start
values. That approach was built, tried, and deleted — see
[Traps](#traps-do-not-re-litigate-these).

### Files

| File | Role |
| --- | --- |
| `app/routes.ts` | Route config; the layout wrapper lives here |
| `app/routes/workspace.tsx` | Layout route. Loads the note list once, picks the focused note, touches it on open, renders the surface + `<Outlet/>` |
| `app/workspace/note-surface.tsx` | **The** note. Modes `page` / `boxed`. Auto-height fields, save-on-blur, double-click toggle |
| `app/workspace/word-roller.tsx` | Chevrons above/below the caret's **unit** + slot-machine roll. Holds the climb, and the widened unit span, across re-locates |
| `app/notes/notegrid.tsx` | The library grid (CSS columns), note cards, the twin ghost row, vocabulary dialog |
| `app/notes/ghost-card.tsx` | **One** component for both ghost cards. `tone` is the only axis that varies — see trap 30 |
| `app/notes/chat-card.tsx` | A conversation in the grid. Shows the summary, or how many turns are still unsummarised |
| `app/chat/chat-surface.tsx` | The conversation, in the boxed note's chrome. Transcript, composer, the three-part summary when finished. Owns its own fetchers for `send` / `finish` / model choice — two of them, so "Thinking…" and "Summarising…" stay distinguishable |
| `app/routes/chat.tsx` | Action-only: `send` / `finish`. No loader and no component, because the conversation renders as an overlay inside the workspace layout rather than on a page of its own |
| `app/routes/chats.tsx` | Action-only resource route: create and delete, the things you do to a chat from outside one |
| `app/lib/local-time.tsx` | Timestamps without a hydration mismatch — see trap 31 |
| `app/routes/notes.tsx` | The action for **every** note mutation. No loader — reads the list from the layout |
| `app/app.css` | Layout, motion and type: Playfair + EB Garamond, the page-enter animation, the note-preview mask |
| `app/themes.css` | The seven palettes. One `[data-theme]` block each, ten role tokens apiece. `@theme inline` is what makes them swappable — a plain `@theme` would compile the values into the utilities as literals |
| `app/lib/themes.ts` | The registry: id, label, appearance. Metadata only, no colours — `themes.test.ts` asserts it agrees with the CSS |
| `app/lib/theme.server.ts` | The palette cookie. Deliberately *not* HttpOnly, unlike the session cookie: it is a colour preference, and hiding it would rule out ever reading it on the client |
| `app/chat/model-picker.tsx` | Two native selects above the composer. Only providers the account holds a key for, only models that key actually reached |
| `app/routes/api.active-model.tsx` | Action-only route for the picker. Not an intent on the chat's action: the choice belongs to the account, and posting it there would revalidate a transcript to change a dropdown |
| `app/routes/api.vocabulary.tsx` | Action-only route for the flashcard dialog. Outside the layout for the same reason as the ladder |
| `app/lib/api.server.ts` | Server-only typed API client. The browser never calls the backend directly |
| `app/routes/api.word-ladder.tsx` | Loader-only resource route feeding the roller. Outside the layout on purpose — a lookup inside it would revalidate the note list on every chevron click |
| `backend/app/services/vocab.py` | The ladder: unit detection, WordNet candidates, frequency ordering. Pure apart from calling the ranker |
| `backend/app/services/ranker.py` | The judge: embeds the sentence with and without each candidate through a hosted model and keeps the closest. Returns `None` rather than raising when there are no credentials, so a token-less install still gets dictionary-ordered ladders |
| `backend/app/api/deps.py` | Resolves the requesting user from a bearer token or the cookie. Every failure is the same 401 |
| `backend/app/core/security.py` | argon2 hashing and HS256 tokens. Both halves fail closed |
| `backend/app/cli.py` | `python -m app.cli` — invites, account creation, adopting the old dev user's notes |
| `frontend/app/lib/session.server.ts` | The HttpOnly cookie holding the token. Set by this server, not by FastAPI — different origins |
| `backend/app/crud/word_ladder.py` | Cache. Resolves the unit **before** the key is computed — see the trap |
| `backend/app/services/llm.py` | The LangChain layer. A **registry** of providers, not `init_chat_model` — see trap 32. One `ProviderError` out |
| `backend/app/services/conversation_summary.py` | The three parts, via `with_structured_output`. Returns `None` on any failure, like `ranker.py` |
| `backend/app/core/secrets.py` | Fernet encryption for the reader's API key, HKDF-derived from `JWT_SECRET`. `decrypt` fails closed to `None` |
| `backend/app/api/chats.py` | Chats. Three distinct refusals (409 no key, 409 finished, 502 provider), and it scrubs the key out of provider errors — trap 33 |
| `backend/app/api/settings.py` | The provider credentials. `GET` returns the last four characters of a key and nothing more. Saving one calls the provider **first**, so a key that will not work is refused in the dialog that asked for it rather than at someone's first question |

### Data flow

- One loader (the layout's) fetches the note list **and the chat list**, so the
  library has one fetch and one revalidation for everything it shows. Children
  read it with `useRouteLoaderData("routes/workspace")`.
- All note mutations post to `/notes`'s action with an `intent`:
  `create` · `update` · `togglePin` · `touch` · `delete` · `markKnown`.
  Chats have their own: `/chats` takes `create` · `delete`, and
  `/chats/:chatId` takes `send` · `finish` — both action-only routes with no
  component, since the conversation itself renders inside the workspace layout.
- After any action React Router revalidates the layout loader, so the UI follows
  the database with no manual refetching.
- The grid interleaves notes and chats by `updated_at` rather than grouping them
  by kind. `"messages" in item` is the discriminator, and keys are prefixed
  (`note-7` / `chat-7`) because ids restart per table.

### Backend

- `notes.updated_at` (migration `b1d4e7a90c25`) drives "which note is the
  landing note". `list_notes` orders by `updated_at DESC, id DESC`.
- `POST /api/notes/{id}/touch` bumps it. **Needed** because an empty PATCH
  changes no attributes, so SQLAlchemy's `onupdate` never fires — opening a
  note has to touch it explicitly. `crud/chat.py::add_exchange` sets
  `chat.updated_at` by hand for the same reason: appending to a relationship
  does not dirty the parent's own columns.
- Migration `f2b6c48e0d19` adds `provider_credentials`, `chats` and
  `chat_messages`. Migration `a9d3c17b52f4` then made credentials **one row per
  provider per user** and moved the selection onto the user as
  `active_provider` / `active_model`. The earlier note here argued for one row
  per user, on the grounds that a set of keys would need an "active" flag to
  keep in step with. That objection was right and is answered rather than
  ignored: the flag does not live on the credential, it lives on the user, so
  there is still exactly one place that says what the account chats with. What
  the change buys is that holding an Anthropic key and an OpenAI key no longer
  means re-pasting one to go back to it, which is what makes a model picker in
  the chat worth having at all. Each row also caches the model list the key
  returned when it was last checked.
- `chats.summarized_at` is the *only* test for "finished". A separate status
  column would be a second fact to keep in step, and the two would disagree.
  The four summary columns are written together by `store_summary` or not at
  all, and read together through the nested `summary` object.

### The chat, and the reader's key

The word ladder's ranker calls a hosted model with the **deployment's** token.
A chat calls a provider with the **reader's**, which is a different problem:

```
/settings ─▶ provider_credentials   Fernet ciphertext, key derived from
                                    JWT_SECRET by HKDF (core/secrets.py)
          ─▶ services/llm.py        registry → ChatAnthropic / ChatOpenAI
          ─▶ conversation_summary   with_structured_output → three parts
```

No new environment variable was introduced; deriving from `JWT_SECRET` avoids a
second secret to set and lose. The cost is stated in `secrets.py`: rotating
`JWT_SECRET` (the documented "sign everyone out" lever) also orphans every
stored key. That reads as "no key on file" rather than a 500, because pasting
the key again is the only remedy either way.

### The word ladder

`GET /api/vocab/ladder?sentence=…&caret=N` — a **caret**, not a word, because
the thing to replace is not always the word under it. The response carries the
`start`/`end` it resolved to, so the caller knows what to underline and swap.

```
caret ─▶ unit          longest known phrase, else the word, article folded in
      ─▶ candidates    WordNet synonyms of the chosen senses
      ─▶ ranker        which of them read correctly in this sentence
      ─▶ rungs         survivors, ordered by word frequency
```

Three environment switches. `MLM_MODEL` is gone with the local masked LM it
named; the ranker is a hosted call now and nothing is baked into the image:

| Variable | Default | Effect |
| --- | --- | --- |
| `LADDER_RANKING` | `on` | `off` skips the model entirely: dictionary-only ladders, cached per word |
| `HF_TOKEN` | unset | Credentials for the hosted ranker. Unset behaves like `LADDER_RANKING=off`, and `ranker.enabled()` checks it *before* any request so a token-less install never waits out a timeout to discover it |
| `HF_MODEL` | `sentence-transformers/all-MiniLM-L6-v2` | The embedding model the ranker calls |

Cached in `word_ladders`, keyed `(word, context_hash)`. The hash is empty when
ranking is off — a dictionary ladder depends on nothing but the word, so it
should stay cached under it.

---

## 4. Traps (do not re-litigate these)

Each of these cost real time. They are all commented at the site too.

1. **masonic cannot handle a shrinking list.** Its positioner probes indices
   past the end and throws (`undefined` in `itemKey`, then "Invalid value used
   as weak map key"). The old code worked around it with
   `key={ids.join("-")}`, which remounted every card and killed the reflow
   animation. **Removed entirely** — the grid is now CSS `columns-[280px]`,
   which server-renders and never remounts its cards.

2. **framer `layoutId` does not link across a React Router navigation.** The
   loader is async, so the removal and the addition land in different commits
   and framer discards the measurements. This is *why* the layout route exists.

3. **framer suppresses `initial`/`animate` on the element leading a shared
   `layoutId`,** and ignores later `animate` changes on it. Drive those
   properties with CSS transitions or state-toggled classes instead.

4. **`text-align` cannot be tweened.** Any alignment that differs between two
   animated states snaps the words sideways mid-transition. Both modes are
   centred for exactly this reason.

5. **Form controls do not inherit `text-align`.** Setting `text-center` on a
   parent leaves the textarea computing `start`. Put it on the field.

6. **Never trust a zero-width measurement.** `scrollHeight` on an unlaid-out
   textarea reports the text wrapped one character per line — this once made
   the hero title 603px tall and pushed the body off screen. Both
   `useAutoHeight` and `word-roller` guard on `clientWidth === 0`.

7. **`scrollIntoView` is fooled by framer transforms.** On the first frame the
   panel is parked at its old position, so it measures as already visible and
   refuses to scroll. Walk `offsetTop` instead — it is layout based.

8. **Distinguishing the first click of a double click** needs
   `event.detail > 1` guarding, not a plain flag. The second mousedown
   otherwise overwrites whatever the first recorded.

9. **Outside-click-to-dismiss must ignore elements with their own meaning.**
   A mousedown on a note card used to close the open note *and* let the card
   navigate, racing two navigations for one gesture. It now skips
   `[data-note-card], button, a`.

10. **Textarea word positions need a mirror element** — a hidden div copying the
    field's box and typography exactly, with the target word in a measurable
    span. Copy width, font, letter-spacing, line-height, `text-align`, padding
    and borders, or the mirror's line breaks will not match the field's.

11. **The in-app browser pauses between tool calls.** It sometimes reports
    `window.innerWidth: 0` while rendering correctly, and — worse — it stops
    advancing the clock: `requestAnimationFrame` never fires, `setInterval` gets
    ~4 ticks in 2.4s, and a CSS transition sits frozen at its *start* value
    (inline `font-size: 1.875rem`, computed still `52px`, indefinitely). A
    screenshot forces a frame, which is why state sometimes only appears after
    one. **You cannot measure animation smoothness or time anything in this
    browser.** Assert on settled state; verify motion by reasoning about the
    code, and say so rather than claiming it was observed.

12. **A controlled `<textarea>` drops the caret to the end when its value
    changes.** Restoring it in `requestAnimationFrame` runs *before* React
    commits, so the restore is silently undone. The chevrons then vanish
    mid-climb because the caret is no longer inside the word. Use a layout
    effect (`pendingCaret` in `note-surface.tsx`) — after the DOM updates,
    before paint. This was invisible while the roller rolled a word to itself.

13. **`useFetcher()` keeps only the newest response.** The caret crosses words
    faster than the network answers, so a slow reply for a word you have already
    left lands on the word you are on now — and if a guard rejects it, the state
    machine deadlocks and the chevrons never enable. Give each lookup its own
    fetcher with `useFetcher({ key })`. It doubles as a cache: revisiting a unit
    costs no request.

14. **State that must agree has to change in the same batch.** Committing a roll
    advanced the climb while the measured span still described the old word; for
    one render the climb looked like it belonged elsewhere and was discarded, so
    a climb could never pass its first rung. `setSpan` and `setClimb` now move
    together.

15. **`wordAtCaret` only ever finds one word, and will shrink a unit back.**
    Once the span is widened to "a model" or "gave up", every caret move
    recomputes it as "model"/"gave", the climb loses its anchor and **down** dies
    after one press. `word-roller` holds the unit in a ref and keeps it while
    the caret is inside it and the text still reads as it was left.

16. **Word frequency cannot separate archaic from merely rare.** A frequency
    *floor* looks like the obvious way to drop WordNet junk, and it is backwards:
    "shew" scores 2.46, above both "obfuscate" (2.28) and "felicitous" (1.86).
    Any floor cuts good rungs and keeps the junk. Only `zipf == 0` — no signal at
    all — is safe to filter on.

17. **Word frequency cannot separate an idiom from two adjacent words either.**
    "run through" scores 5.34 against "give up" at 5.63, because `wordfreq`
    estimates a phrase from its parts. So there is no frequency test for "is this
    really a phrasal verb here". The ranker decides it instead, by scoring the
    phrase's synonyms against the bare word's.

18. **A masked LM can *score* words it cannot *say*.** One `[MASK]` emits one
    token, and the ~30k WordPiece vocabulary has no single token for the rare
    words this feature exists to offer — `felicitous` is `fe ##lic ##ito ##us`,
    and 7 of 15 sampled hard words split while every plain word survived. So
    generation is structurally biased against the rare end of the ladder.
    Scoring a candidate you already hold has no such limit. **This asymmetry is
    the whole reason the architecture is dictionary-proposes / model-ranks.**

19. **Fluency is not synonymy, and per-word filtering cannot fix it.** "This is a
    bad problem" reads perfectly, so scoring loose candidates by fit lets "bad"
    through as a synonym for "big". Score *senses as groups*: a sense is a set of
    words meaning the same thing, and the wrong set reads badly together even
    when one member reads fine alone.

20. **Do not normalise the ranker by word frequency.** Pointwise mutual
    information is the textbook correction for "common words score well
    everywhere" — and it made this worse, because it rewards rarity and the
    ladder already climbs toward rarity. The two compound: "running through the
    park" went straight back to offering "escaping". Raw fit is correct *because*
    difficulty is applied separately, afterwards.

21. **Resolve the unit before computing a cache key.** Which unit the caret is in
    depends on the sentence — "running through" is the unit in "…through the
    supplies" and not in "…through the park". Keying on the raw longest match
    serves one sentence's answer to the other, and it looks like the ranker is
    broken when it is not.

22. **A shared Postgres volume remembers migrations from other branches.** Switch
    to a branch that lacks a revision the DB is stamped with and the backend will
    not start: `Can't locate revision identified by …`. Downgrade *before*
    switching, or restore the file temporarily, mount the host tree into the
    image (`COPY . .` means a `compose run` will not see your working copy), and
    `alembic downgrade` with the real password from `.env`.

23. **Docker Desktop on macOS has no GPU passthrough.** Anything model-shaped in
    this container is CPU-only whatever you install, so pin the CPU torch wheel
    (`--extra-index-url https://download.pytorch.org/whl/cpu`) or pip drags in
    gigabytes of unusable CUDA. (Moot since the ranker became a hosted call,
    kept because it will be true again the moment anything runs locally.)

24. **`git checkout` silently overwrites gitignored files.** `.env` was tracked
    until `bf9d899`. Checking out any branch older than that restores the old
    tracked copy over yours without a word, and the next `pull` deletes it.
    This destroyed a live `.env` once. It was recoverable only because the
    containers were still running and hold every value in their environment:
    `docker exec restyle-db-1 printenv POSTGRES_PASSWORD`. Had they been down,
    the database password existed nowhere else — it is written down in exactly
    one place.

    Mostly defused: `prod` was fast-forwarded to `dev` and every merged branch
    deleted. **Two branches still carry it**, both unmerged and both kept on
    purpose: `feature/contextual-ladder` and `feature/restyle-reframe`. Copy
    `.env` somewhere before checking out either.

25. **The test suite never runs a migration.** `conftest.py` builds the schema
    with `Base.metadata.create_all`, so a broken migration passes all 138
    tests. CI's `migrations` job is the only thing that would catch it, and it
    round-trips upgrade → downgrade → upgrade against Postgres, because a
    downgrade nobody runs is a stub with a docstring.

26. **`render_as_batch` in `env.py` is autogenerate-only.** A hand-written
    migration must open `op.batch_alter_table` itself; a bare `op.alter_column`
    still dies on SQLite. See `e4a17c8b3f92`.

27. **A fixed-position badge cannot be fixed with a background colour.** The
    account bubble overlapped the note; giving it the page ground hid the
    collision rather than preventing it. It had to leave the float and take a
    band of its own. A negative margin to close the resulting gap puts the
    overlap straight back — measure with `getBoundingClientRect`, do not judge
    by eye.

28. **Ownership belongs in the crud signature, not the route.** `crud/note.py`
    takes `user_id` as a required argument so a forgotten one is a `TypeError`
    at import. As an optional filter it silently meant "any user". Related:
    check ownership *before* the write — `update_note` and `touch_note` used to
    mutate and then discover the row was missing, so a check bolted on after
    the call would have edited someone else's note before refusing.

29. **Fixtures that build users directly miss what registration does.**
    `DELETE /api/users/me` was a 500 for every account created through the
    front door, because `invite_codes.used_by_user_id` had no relationship to
    release it. Every test passed: none of them redeemed a code.

30. **CSS columns have no "top right" index.** Putting the second ghost card at
    the right of the grid's first row cannot be done by ordering the items:
    `columns-[280px]` fills top-to-bottom then left-to-right, and the column
    count changes with the window, so no index reliably lands there. Both
    ghosts were lifted **out** of the columns into one `flex justify-between`
    row above the grid. Measured: 280×200 each, 64px from either edge, holding
    from 1200px down to 600px and wrapping below that.

31. **SSR renders dates in the container's timezone and the browser in the
    reader's.** `Intl.DateTimeFormat(...).format(new Date(iso))` in a card gave
    "Aug 20, 2026, 2:41 AM" on the server and "Aug 19, 2026, 10:41 PM" in the
    browser, which React calls a text mismatch: **error #418 on every visit to
    `/notes`**, minified to a stack of one-letter frames that names nothing.
    This was pre-existing on note cards and easy to reproduce by diffing the
    SSR HTML (`fetch('/notes')`) against the live DOM. Fix in
    `app/lib/local-time.tsx`: format in `UTC` for the server render *and* the
    hydration pass, so the two strings agree, then switch to the local zone in
    an effect. Rendering nothing server-side also silences it and makes every
    card jump as the dates arrive.

32. **`init_chat_model` is the wrong shape for a user-supplied provider.** A
    string-resolved model fails at the first request with a real key, which is
    the one moment there is no test coverage. `services/llm.py` keeps a table
    of import paths instead, so a renamed class is caught by a test with no
    credentials at all. Verified against langchain-anthropic / langchain-openai
    1.6.0: both accept `api_key` and `model` as aliases (`anthropic_api_key`,
    `model_name`), which is what lets `chat_model` be one code path. Re-check
    that if either package is upgraded.

33. **Providers quote the offending key back in authentication errors.** The
    502 detail passes the provider's own words through, because they are the
    only thing separating a bad key from a rate limit from a dead model name —
    and that string goes to the screen and into any log that records a
    response. `api/chats.py::_without_key` scrubs the credential out first.
    A test pins it; it was written failing, and it failed.

34. **The documented Docker typecheck command no longer works.** §2's
    `docker run … node:20-alpine sh -c "react-router typegen && tsc"` dies on
    `Cannot find module './rolldown-binding.linux-arm64-musl.node'`: vite 8
    pulls rolldown, and the host's `node_modules` holds only
    `@rolldown/binding-darwin-arm64`. The `restyle-frontend` image cannot
    stand in — it is a production install with `tsc` but no `react-router` dev
    CLI. Do what CI does and `npm ci` inside the container; §2 has the command.

35. **The workspace loader deliberately does not revalidate on navigation.**
    `routes/workspace.tsx` exports a `shouldRevalidate` returning false when
    there is no `formMethod`. This is not an oversight to be tidied away: the
    layout's loader is the *only* fetch behind `/`, `/notes`, `?open=` and
    `?chat=`, and all four resolve what they show with a `find` over the lists
    it already returned. Left to revalidate, changing a search param re-ran four
    API calls to redisplay what was on screen — 190-436ms measured, and most of
    the delay between a click and anything moving. Writes still refetch, because
    every mutation goes through a fetcher submission and those set `formMethod`.
    The price is that a note edited in another tab does not appear until the
    next mutation. That trade was made on purpose.

36. **A migration that ALTERs a constraint must use `batch_alter_table`, and
    nothing in CI will tell you.** SQLite cannot alter a constraint at all, so
    `op.create_foreign_key` / `op.create_unique_constraint` outside batch mode
    raise `NotImplementedError` there. Nothing catches it: the test suite builds
    its schema with `create_all` (trap 25) and the migrations job only runs
    Postgres, where the plain call works. `d8c25a71f3b0` shipped broken this way
    and `alembic upgrade head` on SQLite failed on it and nowhere else. Batch
    mode costs nothing on Postgres — it issues the same direct DDL.

37. **In batch mode, a constraint added in the same pass as a rename goes
    missing without complaint.** SQLite's batch mode recreates the table from
    what it reflected at the start of the block, so a `create_unique_constraint`
    sharing a block with `alter_column(new_column_name=...)` is written against
    a column the reflected schema does not have yet. The upgrade reports
    success, the constraint is simply absent, and the first thing to notice is
    the *downgrade* failing with "No such constraint". Split the rename and
    anything that references the new name into two `batch_alter_table` blocks —
    see `e7d41a20c9b8`.

---

## 5. Conventions

- **Enter commits, Shift+Enter is a newline** — in every single-line field.
  **Not in a note's body**, where Enter is a paragraph break like anywhere
  else. "Everywhere" is what this line used to say, and taking it literally is
  what made the note untypable: the handler sits on the container, so it caught
  the body too, and Enter blurred the field mid-sentence.
- Escape also saves and closes; nothing discards.
- Saves only submit when the text actually changed.
- Animation: tweens, never springs (springs wobble even at `bounce: 0`).
  `NOTE_LAYOUT_TRANSITION` in `note-surface.tsx` is the shared curve.
- Serif everywhere: Playfair Display (display) + EB Garamond (body).

---

## 6. Timeline

**Expanding note editor.** Double-click a card to expand it. Started as a fixed
overlay dialog; reworked to an in-flow block so the other notes reflow around
it. Fixed content warping during the morph with `layout="position"` scale
correction.

**Design direction.** Wrote `DESIGN.md` — editorial rather than dashboard,
serif, whitespace over rules, a Starry-Night line-art ornament layer, and a
navigation philosophy (Apple / Google Maps / Dynamic Island). Then applied the
typography and palette: serif fonts, warm paper tokens, borderless cards.

**Sidebar removed** outright, along with `app-sidebar.tsx`, `welcome.tsx` and
the `SidebarProvider` wrapper.

**Landing page** built as a live hero of the last-studied note, editable in
place, double-click to open it in the grid.

**masonic → CSS columns**, after masonic proved unable to handle the grid
shrinking when a note opens.

**The restructure.** Repeated "it still jumps" reports traced to a single root
cause: `/` and `/notes` were separate routes, so nothing survived navigation and
every transition was two elements imitating each other. Rebuilt around the
layout route above. Added `updated_at` + `touch` so the landing note follows
what you actually opened.

**The word ladder.** The vocabulary the roller was waiting for. WordNet supplies
synonyms but has no notion of formality, so frequency provides the missing axis:
rare words read as formal and difficult, common ones as plain. A word's ladder
is its synonyms ordered by how common they are, with the word itself on its own
rung — up is rarer, down is plainer, and the climb is anchored to the word you
started from so pressing down walks back exactly the way you came. Built in
`app/services/vocab.py`, cached in `word_ladders`, served from
`GET /api/vocab/ladder`, and read by the roller through a loader-only resource
route. See [§7](#7-open-items) for where the quality actually stands.

**Word roller.** Chevrons above and below the caret's word; clicking rolls the
word like a slot reel. It runs on
**both** fields — title and body — from the same component; the title just
needed the same tightly fitting relative wrapper the body already had.

The reel masks the live word with an opaque strip, so it has to know what it is
sitting on. That colour is not constant: the landing page is bare `paper` and
the boxed note is `paper-raised`, and hardcoding the latter left a visible patch
on `/`. `note-surface` now passes the surface colour down. The reel also copies
the field's own typography — sitting outside the textarea, it otherwise
inherited the wrapper's type and rendered the display-face title at body size.

**Units, not words.** Replacing the caret's word is the wrong unit surprisingly
often. "give up" means something neither of its words does and has a ladder
neither can reach; an article has to travel with the word it attaches to, or
"an example" becomes "an model". Two findings drove this: **33% of WordNet's
lemma names are multi-word** (68,082 of 206,978) and were all being discarded by
a `"_"` filter, and `similar_tos()` — the adjective satellite clusters — was
never followed, which had left "big" with two candidates where it has 88. The
caret now resolves to a unit: longest known phrase else the word, lemmatised so
"gave up" finds `give_up`, with the tense restored at the **head** for verb
phrases and the **tail** for noun compounds. (Getting that backwards produced
"businesses firm" for "business firms".)

**The generative experiment — tried and abandoned.** Before the current design,
the masked LM was used the obvious way round: blank the word out of its sentence
and ask what fits. It genuinely solved disambiguation — "a ML model" drew
*project, design, code* while "a model in Paris" drew *director, professional* —
but it destroyed meaning, because fill-mask proposes what *fits the slot*, not
what means the same: `big → small`, `use → know, take, love`, `good → public`.
It also cut off the rare end of the ladder for the tokenizer reason in trap 18.
Latency was never the problem (~40–70ms). The branch was closed as
[#14](https://github.com/TS-24/restyle/pull/14); its torch/transformers
plumbing was kept. **Do not re-attempt generation** — the failure is structural,
not a matter of prompting or thresholds.

**The inversion.** The same model, used as a judge instead. WordNet proposes
(no vocabulary ceiling — it is a dictionary) and the model ranks (no synonymy
needed — it only compares). That is `ranker.py`. It fixed the wrong-sense
problem the ladder shipped with, and the same instrument settles which *unit*
the caret is in:

```
"She was running through the park."      → going, running, leading, passing
"We were running through the supplies."  → using up, eating up, wiping out
```

Three approaches were tried and rejected on the way, all recorded as traps
19–21: per-word fluency filtering, taking only the single winning sense, and PMI
frequency normalisation.

**AI chats (#34).** A second object in the library, and the first credential the
app holds on a *user's* behalf rather than the deployment's. LangChain talks to
whichever of two providers the reader configured on `/settings`; the key is
Fernet-encrypted at rest and never leaves through the API. Finishing a chat asks
the same provider for a summary in three parts — what it was about and its
topics, what the reader kept asking, what the answers concentrated on — which is
what the chat's card shows in the library from then on, because nobody rereads a
transcript. Parts two and three only work because the transcript labels its
speakers; an unlabelled block cannot separate the asking from the answering.

Hugging Face was the original plan for the summary and was **dropped before any
of it was written**: `summarization` against `bart-large-cnn` cannot follow an
instruction, so "the main focus of the questions" and "topics" were not
expressible, and it would have meant a second credential for a call the reader's
own key already covers. Nothing HF-shaped was added; `ranker.py` and `HF_TOKEN`
are untouched.

---

## 7. Open items

Ordered by how likely they are to bite.

**A chat has never spoken to a real model.** There is no provider key on this
machine, so everything up to the provider boundary is verified and nothing past
it is: a real reply, and a real three-part summary, have **not** been seen. What
*was* seen is a genuine 401 from Anthropic with a deliberately invalid key, so
decryption, client construction, the network call and the error path do work.
The first thing to do with a real key is send one message and finish one chat.

~~**`gpt-5.1` is a guess.**~~ **No longer load-bearing.** The registry defaults
are now only a *preference*: saving a key fetches the provider's real catalogue,
and `settings._preferred` uses the registry's default solely if the provider
still lists it, else the first id it does list. A stale default therefore costs
nothing, and the editable model field it used to justify is gone — the model is
picked in the chat, from what the key actually reached.

**`alembic check` is red on `dev`, and was before #34.** `invite_codes` and
`revoked_tokens` were migrated with a unique *constraint* plus a plain index,
while their models declare `unique=True, index=True`, which SQLAlchemy renders
as a unique *index*. Functionally identical, so nothing is broken and the
round-trip test passes; it just means `alembic check` cannot currently be used
as a drift gate. The three tables added by `f2b6c48e0d19` are clean, because
that migration writes `create_index(..., unique=True)` to match. Fixing the two
old tables is a small migration nobody has needed yet.

**Authentication landed (#22, #23), and revocation with #26.** Invite-only
registration, a JWT in an HttpOnly cookie set by the React Router server, a
seven-day token, and every route scoped to its owner. Accounts come from
`python -m app.cli issue-invite` or `create-user`. Still missing: a password
reset, and any way to change a password at all — `UserUpdate` carries a username
and an email and nothing else.

**The Sign out button does not reach the revocation it was built for.**
`POST /api/auth/logout` records the token's `jti` in `revoked_tokens` and
`deps.get_current_user_optional` honours it on every request, so revocation
works. But the app's Sign out posts to the *frontend's* `/logout`
(`routes/logout.tsx`), which only clears the session cookie this server set —
nothing in `lib/api.server.ts` calls the API route at all. So the token inside
that cookie stays valid for its remaining seven days, and the feature is
reachable today only from `curl` or `/docs`. Fix is one call in the frontend's
logout action, which needs the token before it destroys the cookie.

**Before this faces the internet.** `docker-compose.prod.yml` now covers most
of it: only Caddy is published, it terminates TLS and gets its own certificate,
`ENVIRONMENT=production` turns off `/docs` and marks the cookie `Secure`, and
neither Postgres nor either service is reachable except through the proxy. It
needs `DOMAIN` set to a name that resolves to the host. What is still missing
is anything that actually runs it: CI publishes images to GHCR and nothing
deploys them, and there is no password reset.

0. **Acronyms and jargon have no ladder at all, and ranking cannot give them
   one.** `ML` resolves to *millilitre*; `API` and `GPU` have no WordNet entry
   whatsoever. This is a *lexicon* problem, not a ranking problem — the
   candidate isn't in the box, so nothing downstream can surface it. Two fixes,
   in order of cost: (a) a guard that declines on tokens the frequency corpus
   does not know, so the roller says nothing instead of offering `MILLILITRE` —
   cheap, and worth doing regardless; (b) an open-vocabulary fallback (hosted
   LLM, or PPDB for phrases) called *only* on lexicon misses and cached forever,
   which converges to almost no calls because a person's jargon is small and
   repetitive.

1. **Some noun senses still do not discriminate.** `model` returns the
   *example/exemplar* reading in both "a ML model" and "a model in Paris", which
   is worse than the plain dictionary's *framework* for the first. Verbs
   discriminate well (`running` is correct in both park and supplies); nouns are
   the weak spot. Suspect the sense-group mean in `ranker.rank_senses` favours
   senses made of common words — but note that the obvious correction for that,
   dividing out word frequency, was tried and made things worse (trap 20). Try
   scoring senses by their gloss instead of by their members.

2. **The ranker costs a network round trip on a cache miss.** It is a hosted
   call now, not a local model, so the image is small but an offline install
   has no ranking at all and a miss is as slow as the network. A unit is cached
   after its first look, so this is a first-press cost per sentence, not per
   keystroke. `LADDER_RANKING=off` reverts to dictionary-only.

3. **Both ghost cards write a row on click**, before anything is typed. The
   `+` note ghost leaves an empty `Untitled` note, and because it is then the
   most-recently-updated note it *takes over the landing page*. The new AI chat
   ghost has the same shape of problem and is milder: an abandoned chat is a
   card reading "Nothing said yet." that never leaves the grid, but it cannot
   hijack the landing page, which only ever shows a note. Fix for both: delete
   the row on close when it is still empty.

4. **Closing a note leaves a dead end.** Done / Escape / click-away drop you on
   the bare library with no note to double-click and no exit link, so the only
   way back to `/` is the browser's back button. Decide between: make those
   actions also return to `/`, or give the bare library its own quiet exit.

5. ~~**Vocabulary analysis is not wired up.**~~ **Done.** The endpoint exists
   (`POST /api/analyze/vocabulary`), and nothing calls it from the browser any
   more: the analytics page runs it in its loader over every note joined
   together, and the grid's flashcard dialog posts to the `api.vocabulary`
   resource route. That route is deliberately outside the workspace layout, for
   the same reason `api.word-ladder` is — a fetcher submission inside it would
   revalidate the whole note list every time the dialog opens.

6. ~~**Dark mode does not exist.**~~ **Done, and generalised past dark mode.**
   The ramp is ten role tokens per palette in `frontend/app/themes.css`,
   selected by `data-theme` on `<html>`; seven palettes ship and five are dark.
   The choice is a cookie resolved in the root loader, so the server's first
   byte is already in the right colours. `color-scheme` is set per palette. Two
   tests hold it together: `themes.test.ts` fails when the CSS and
   `lib/themes.ts` disagree, and `no-hardcoded-colours.test.ts` fails when a
   component names a Tailwind colour instead of a role.

7. **The ornament layer (DESIGN.md §6) is unbuilt.** Needs real SVG line art;
   it is specified but has no assets. This is the only item in DESIGN.md §12's
   "Remaining" list that is blocked on something other than code.

8. ~~**`components/ui/*` is unmigrated**~~ **Done** — they sit on the role
   tokens now, which the themes work required, and the no-hardcoded-colours
   test covers them along with everything else.

9. **`/analytics` and `/settings` are outside the workspace layout.**
   `/settings` has since been through the house form — an identity card, the
   theme picker, the provider section with its add-key dialog — but
   `/analytics` has only been brought onto the colour tokens, and is still a
   bold sans heading over a `flex-wrap` cloud. Neither page has been through
   §9's navigation rules.

9b. **A finished chat cannot be reopened, extended, or branched.** Summarising
   closes it: `POST /messages` answers 409 once `summarized_at` is set. Deciding
   otherwise means deciding what happens to a summary that no longer describes
   the conversation — re-summarise on every turn, or mark it stale. Left alone
   deliberately rather than overlooked.

9c. **Chat replies are one request, not a stream.** A long answer is a long
   wait behind "Thinking…" with nothing arriving. LangChain's `.stream()` would
   fix it, but React Router actions return once, so it needs a resource route
   returning a stream and a reader on the client — a real change, not a flag.

9a. ~~**`backend/venv` cannot run the app.**~~ **Gone.** That directory is no
   longer on disk. Backend work runs in the container or from
   `backend/.venv-test` — gitignored, built with `uv`, and what the 296 tests
   were last run from. `run_once.py` remains the only importer of `wn` and
   `defusedxml`, neither of which belongs in `requirements.txt`; it is a
   one-off script, not part of the app. The `psycopg2-binary` pin is not a
   conflict with a venv holding `psycopg` 3: SQLAlchemy resolves the bare
   `postgresql://` URL in `app/db/database.py` to psycopg2, and `run_once.py`
   uses psycopg 3 on its own. See SAFETY-UPDATES.md.

10. ~~**The root `.gitignore` is UTF-16 encoded.**~~ **Fixed.** Both ignore files
   are UTF-8 now and 5,914 files were dropped from the index: `backend/venv/`
   (5,807), `notes2.0/.git.bak/` (101, now `frontend/.git.bak/`), the 5 stray `__pycache__` files outside
   the venv, and `.env`. All of them are still on disk; only the tracking is
   gone. `.env.example` is the template now.

   **Two things to know.** First, `.env` remains in git history and this repo is
   public, so treat that Postgres password as burned — it is a throwaway pointing
   at `localhost`, but do not reuse it. Removing it properly means a history
   rewrite (`git filter-repo`), which was not done. Second, and this is the trap:
   **an editor that saves as UTF-16 will silently do it again.** `file .gitignore`
   must say ASCII or UTF-8. It is worth checking after any edit to that file,
   because git gives you no error at all — the patterns simply stop matching.

---

## 8. Verification habits that paid off

- Typecheck, then `docker compose up -d --build frontend`, then drive the real
  app in the browser. Several bugs here were invisible in the source.
- Check the API directly after any mutation, and again before you finish. Every
  route needs a token now, so this is no longer a bare curl:
  `curl -s -H "Authorization: Bearer $TOKEN" localhost:8700/api/notes | python3 -m json.tool`.
- Read the console after UI changes — two crashes were only visible there.
- **Test against a scratch note, not the user's notes.** Create one via
  `POST /api/notes`, drive it, `DELETE` it afterwards. Learned the hard way:
  driving the roller on note 10 left three rolled words saved into it
  (`Demo→Demonstration`, `model→framework`, `wanted→required`) and they were
  only caught by inspecting the API at the end. Restoring meant reconstructing
  the original text from an earlier transcript, which is luck, not process.
- The backend restarts when you `compose up --build frontend`, because frontend
  depends on it. A page load during that window fails with `ECONNREFUSED` and
  looks like a code bug. Check `compose ps` uptime before believing it.
