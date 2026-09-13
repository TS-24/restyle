# Restyle ✍️

**Restyle** is a note-taking app built around one idea: **a note should never stop being the
thing you are looking at.**

The landing page *is* your most recently touched note, live and editable, rendered as markdown
and handing back raw source one block at a time as you write in it. Double-click and a box
animates in around text that never moves, revealing the library of every other note beneath.
Double-click again to go back. That gesture is the whole of the navigation: there is no sidebar
and no nav bar, and the note you were reading is the note you are still reading.

Around that sits the one thing a note can be asked for once it exists: a conversation about it
that writes itself up as a note of its own.

## 🌟 Features

**Working today**

- **Markdown that holds still** — a note reads as rendered markdown and edits as raw text, one
  block at a time: click a heading and you get `## heading` typeset as the heading it is, at its
  size and in its face, so nothing on the page moves under your hands. Task boxes tick and write
  themselves back into the source, links open beside the note rather than over it, and Enter
  carries a list forward.
- **AI chats** — the twin of the `+` that starts a note sits beside it at the head of the
  library, and it opens a conversation in the same box an open note sits in. Finishing one asks
  the model to write it up the way a student takes notes on a discussion they watched: flowing
  prose about the subject, plus a short list of things to do when the conversation implies any.
  That becomes the text of the note the conversation is bound to, because nobody rereads a
  transcript. The prompt forbids describing *you* — your tone, your agreement, your confusion —
  so the notes are about the subject and never about the person who asked.

  **This needs your own API key.** Add one on `/settings` for Anthropic, OpenAI, OpenRouter,
  OpenCode Zen or Fireworks AI. The key is sent to the provider *before* it is stored, so one that will not work
  is refused in the dialog that asked for it rather than at your first question — and the model
  list that same call comes back with is what the picker above the composer offers. Keys are held
  one per provider, so moving between two you own is a dropdown rather than a re-paste. They are
  encrypted at rest and never sent back to the browser. Without one, chats refuse politely and
  tell you where to go. There is no shared or built-in key.
- **Seven palettes** — Paper is the cream-and-indigo ramp the app was drawn in; the rest are ports
  of schemes you may already read code in (Everforest Light and Dark, Rosé Pine Moon, Nord, Tokyo
  Night, Catppuccin Mocha). Picked on `/settings` and kept in a cookie the root loader reads, so
  the server's first byte already carries the right palette and nothing flashes. See
  [Themes](#themes).
- **Note alignment** — an open note runs flush left, centred or flush right, picked on `/settings`
  beside the palette and kept the same way, in its own cookie. Left is the default because centred
  prose is the harder of the two to read at the length a note reaches; centred is how the app was
  drawn (`DESIGN.md` §4) and is one choice away. Structured blocks — lists, quotes, tables — never
  take the alignment itself, since a centred list is unreadable: they keep their own contents flush
  and move as a block, so the note's centre of mass follows the prose. It is one value across both
  of the surface's modes on purpose, because `text-align` cannot be tweened and an alignment that
  differed between them would snap the words sideways the instant the box arrived.
- **Persistence** — notes, pinning, chats and word definitions are stored in PostgreSQL through a
  FastAPI backend.

See [Project status](#-project-status) for what does not work yet.

## 🏗️ Architecture (Monorepo)

```
restyle/
├── web/                       # Frontend (React Router v7 + Vite, SSR)
│   ├── Dockerfile             # Multi-stage; the compose image runs react-router-serve
│   ├── vitest.config.ts       # Separate from vite.config.ts — a unit test wants no
│   │                          #   route manifest and no server bundle
│   └── app/
│       ├── routes.ts          # Route config; the layout wrapper lives here
│       ├── routes/            # workspace (layout), home, notes,
│       │                      #   login / register / logout, menu.tsx (served
│       │                      #   at /settings), and five action- or loader-only
│       │                      #   routes with no component of their own: chats,
│       │                      #   chat, api.active-model
│       ├── workspace/         # note-surface.tsx
│       ├── chat/              # chat-surface.tsx, model-picker.tsx
│       ├── notes/             # notegrid.tsx — the library grid — plus chat-card,
│       │                      #   ghost-card and account-bubble
│       ├── components/ui/     # shadcn/ui primitives on the role tokens, plus the
│       │                      #   chat set: message, bubble, message-scroller,
│       │                      #   marker, input-group, field, combobox
│       ├── hooks/             # use-mobile.ts
│       ├── lib/               # api.server.ts (server-only typed API client),
│       │                      #   session.server.ts, theme.server.ts, themes.ts,
│       │                      #   types.ts
│       ├── app.css            # Layout, motion, type: Playfair + EB Garamond
│       └── themes.css         # The palettes — one [data-theme] block each
├── backend/                   # API + persistence (FastAPI + SQLAlchemy)
│   ├── main.py                # App entrypoint: CORS, /health, router wiring
│   ├── entrypoint.sh          # Runs `alembic upgrade head`, then uvicorn
│   ├── app/
│   │   ├── api/               # Routers: auth, users, settings, notes, chats,
│   │   │                      #   deps.py holds the current user
│   │   ├── cli.py             # Invites, accounts, housekeeping
│   │   ├── core/              # config, security (argon2 + JWT), secrets (Fernet)
│   │   ├── crud/              # Database operations
│   │   ├── db/                # SQLAlchemy models and the session factory
│   │   ├── schemas/           # Pydantic request/response models
│   │   └── services/          # llm.py (the provider registry),
│   │                          #   conversation_summary.py
│   ├── alembic/               # Database migrations
│   └── tests/                 # 296 tests across 18 modules
├── docker-compose.yml         # frontend + backend; the database is Neon, not a service
├── docker-compose.prod.yml    # Production overlay: Caddy in front, nothing else published
├── Caddyfile                  # TLS and the reverse proxy, for that overlay
├── .env.example               # Config template; copy to .env (which is ignored)
├── DESIGN.md                  # Visual and navigation direction
└── PROGRESS.md                # Working context: architecture, traps, open items
```

### The structural fact worth knowing

`/` and `/notes` are **children of a layout route** (`app/routes/workspace.tsx`). React Router
keeps a parent mounted while its children change, so the note surface survives navigation between
the two pages. The title and body are literally the same DOM nodes in both modes, which is why
opening a note is not a page swap. Every difference between the two (padding, background, shadow,
type size) is a value on that one element.

This is load-bearing. `PROGRESS.md` records why the alternative was built, tried, and deleted.

### Tech Stack

**Frontend (`web/`)**
- **Framework:** React Router v7 (SSR), React 19, Vite
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4, with `shadcn/ui` and Base UI components
- **Theming:** ten role tokens per palette in `app/themes.css`, selected by `data-theme` on
  `<html>` from a cookie — see [Themes](#themes)
- **Animations:** Framer Motion (tweens, never springs — see `DESIGN.md` §10)
- **Type:** Playfair Display (display) + EB Garamond (body), via Fontsource
- **Tests:** Vitest, `node` by default with `jsdom` requested per file where a DOM is needed

**Backend (`backend/`)**
- **Framework:** FastAPI (Python 3.12)
- **Database:** Neon (hosted PostgreSQL 18) via SQLAlchemy 2.0 ORM, migrations with Alembic. The migrations
  are also SQLite-safe (batch mode), which is what the test suite runs against
- **Chats:** LangChain (`langchain-anthropic`, `langchain-openai`) against a key the reader
  supplies, with each provider's own SDK used directly for the one thing LangChain has no notion
  of — asking a key which models it can reach
- **Tests:** pytest, against SQLite with every provider call mocked

### Themes

Seven palettes: Paper, the light cream-and-indigo ramp the app was drawn in (`DESIGN.md` §4), and
six ports — Everforest Light, Rosé Pine Moon, Nord, Everforest Dark, Tokyo Night, Catppuccin
Mocha. Five of the seven are dark.

A palette is ten role tokens (`paper`, `paper-raised`, `ink`, `hairline`, `accent-surface`,
`accent-ink`, `on-accent`, `danger`, `success`, `scrim`) in one `[data-theme="…"]` block in
`app/themes.css`. `@theme inline` is what makes them swappable at all: a plain `@theme` compiles
its values into the utilities as literals, so `bg-paper` would be one fixed colour for the life of
the build, while the inline form emits a `var()` that a `[data-theme]` block further down can
redefine.

The choice is a cookie rather than a column on the user, so the root loader resolves it from the
request itself and the first byte of HTML already carries the right palette — no blocking inline
script, no first paint in the wrong colours. A dark palette also puts the `dark` class on `<html>`,
because shadcn's own components carry `dark:` rules that key off the class and not the attribute;
without it a dark theme renders correctly right up until a form field goes invalid.

Adding one is a CSS block plus a row in `app/lib/themes.ts`. `themes.test.ts` fails if you do only
one of those or leave a role unfilled, and `no-hardcoded-colours.test.ts` fails if any component
names a Tailwind colour instead of a role token.

How a note's text is aligned works the same way and is built the same way — `app/lib/alignment.ts`
alongside `[data-note-align]` blocks in `app.css`, resolved from its own cookie in the same root
loader, with `alignment.test.ts` reading the stylesheet to check the two agree. Two details are
worth knowing. The attribute is `data-note-align` and not `data-align`, which base-ui already
writes on every popup it positions (`start`, `center`, `end`) — a bare `[data-align="center"]` rule
would also match a centred popup. And every rule is scoped under `.note-text`, which only the open
note carries, because the library cards render the same `<Markdown>` and so the same `.markdown`
class; written against that, the setting would swing the whole grid around too.

### Data model

A user owns many notes; notes and word definitions are linked many-to-many through a

```
User ──< Note
 ├──< Chat ──< ChatMessage
 └──< ProviderCredential
```

Plus `invite_codes` and `revoked_tokens`, which belong to registration and sign-out rather than to
the reading path.

Deleting a user cascades to their notes, chats and every stored credential.

A chat holds its own summary in two columns written together — `summary_notes` and
`summary_actions` — with `summarized_at` as the single test for "finished". A separate status
column would be a second fact to keep in step, and the two would eventually disagree.

Those two replaced four (`general`, `topics`, `questions`, `answers`), and the four were not
backfilled. Nothing was lost: the durable copy of a summary has always been the prose written into
the bound note, and nothing in the interface ever read the columns — finishing a chat redirects to
its note.

`ProviderCredential` is **one row per provider per user**. A reader holding keys for two services
should not have to paste one of them again to go back to it, and the model picker in the chat is
only worth having if the alternatives are already reachable. Each row also caches what that key
could reach when it was last asked, which is what the picker is built from: a provider call on
every chat load would be a spinner, and a provider outage would be an empty picker.

*Which* of those rows is in use is not stored there. It is `active_provider` and `active_model` on
the user, because "what am I chatting with" is one fact about the account, and one fact stored once
cannot disagree with itself. Both are plain strings, so the selection can outlive the credential it
names — the key can be forgotten, or stop decrypting, without those columns changing, and
`crud/provider_credential.py::active` is the single place the two are resolved against each other.

## 🔌 API

All routes are prefixed with `/api`. Interactive docs are served at `/docs` once running, in
development only — `ENVIRONMENT=production` removes them along with `/redoc` and `/openapi.json`.

Every route under `/api` requires a signed-in account. Send `Authorization: Bearer <token>` from a script, or
let the cookie the API sets carry it in a browser. Registration is invite-only. Any signed-in
account can issue a code from `/settings`; the very first one comes from the CLI, because there is
nobody to issue it yet — see [Your first account](#your-first-account).

Anything owned by a user answers **404 rather than 403** when it belongs to someone else. 403
would be more precise and worse: it confirms the row exists, which turns the id space into a
directory of other people's writing.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Liveness check (not under `/api`) |
| `POST` | `/api/auth/register` | Create an account against a single-use invite code. 400 on a bad or spent code, **or on an email the code was not issued for** — one message for all three, so a code cannot be used to find out which address it belongs to. 409 if the email is taken |
| `POST` | `/api/auth/login` | Exchange an email and password for a token. One message for a wrong password and an unknown email alike, so the endpoint cannot be used to find out who has an account |
| `POST` | `/api/auth/logout` | Record this token's `jti` as revoked and clear the API's cookie. Only this token, so other sessions on the same account keep working. Deliberately unauthenticated: someone holding a token they cannot use is still entitled to retire it. **The web app's own Sign out does not call this** — see [Project status](#-project-status) |
| `POST` | `/api/invites` | Issue a single-use code bound to one email address. No quota. 409 if that address already has an account, since a code it can never redeem is a dead end |
| `GET` | `/api/invites` | The codes this account issued, newest first, each with its code still readable — that is where you go back for one you have not sent yet |
| `GET` | `/api/invites/all` | Every code in the system, with who issued it and who spent it. Superuser only |
| `POST` | `/api/password-resets` | Mint a one-time reset link for an existing account, valid an hour. Superuser only, because this opens an account that already exists rather than offering a new one. Nothing is emailed: the link comes back once and is not stored, only its hash, so it cannot be read again |
| `POST` | `/api/auth/reset-password` | Spend a reset link and sign in. Unauthenticated — the token in the link is the credential. A spent, forged or expired one is a 400 rather than a 401, so the page can say why instead of bouncing to `/login` |
| `GET` | `/api/users` | Every account. Superuser only |
| `GET` | `/api/users/me` | The signed-in account |
| `PATCH`/`DELETE` | `/api/users/me` | Update your own username or email, or delete the account. There is no password field on either. Deleting takes your notes, chats and stored keys with it |
| `POST` | `/api/notes` | Create a note. The owner is the signed-in account, never a field in the body |
| `GET` | `/api/notes` | List notes, newest-touched first. `?search=` matches the title; `?skip=` / `?limit=` page; `?archived=true` returns the archive instead, newest put away first. Scope is always the signed-in account, never a parameter |
| `GET`/`PATCH`/`DELETE` | `/api/notes/{id}` | Read, partially update, or delete a note |
| `POST` | `/api/notes/{id}/touch` | Bump `updated_at`. Needed because an empty `PATCH` changes no attributes, so SQLAlchemy's `onupdate` never fires — opening a note has to touch it explicitly |
| `POST` | `/api/notes/{id}/archive` | Put a note away. It leaves the library and keeps everything it holds |
| `POST` | `/api/notes/{id}/unarchive` | Bring it back |
| `POST` | `/api/notes/{id}/close` | The reader left the note. `204` when it was blank and has been dropped, `200` with the note when it stays. Blank means no title and no body — see `crud/note.py::close_note`, which also spares your last note and any note whose conversation got somewhere |
| `GET` | `/api/settings/providers` | Which keys are on file, which providers could be added, and which pair is in use. Never returns a key — only `key_hint`, its last four characters. A key this deployment can no longer decrypt is left out entirely, which is what it is from the reader's side |
| `PUT` | `/api/settings/providers/{provider}` | Store a key for one provider. The provider is called first and nothing is written until it answers, so a rejected key leaves the account exactly as it was — including a working key for the same provider somebody was trying to replace. **422** for a provider not in the registry, **502** when the provider would not have the key. The model list that call returns is stored alongside it. The first key an account saves becomes the one it chats with; later ones do not take over |
| `POST` | `/api/settings/providers/{provider}/refresh` | Ask the stored key what it can reach now, so a model added or retired since is one button rather than a re-paste. **409** if there is no usable key on file |
| `DELETE` | `/api/settings/providers/{provider}` | Forget one provider's key. If it was the one in use the account falls to another key it holds rather than to nothing. Not an error when there is nothing to forget |
| `PUT` | `/api/settings/active-model` | Chat with this provider and this model from now on. Both halves together, both checked against what is actually on file: **409** for a provider with no key, **422** for a model that key never listed |
| `POST` | `/api/chats` | Start an empty conversation. Deliberately does **not** require a key: the refusal belongs on the first message, not on the button that opens the page you are being told to configure |
| `GET` | `/api/chats` | List conversations, newest-touched first |
| `GET`/`DELETE` | `/api/chats/{id}` | Read one conversation with its turns and summary, or delete it and its turns |
| `POST` | `/api/chats/{id}/messages` | Say something and get the reply. Returns the whole chat, so there is one shape for "here is the conversation now" rather than a delta to splice. **409** if no usable key is on file or the chat is already finished; **502** if the provider would not answer |
| `POST` | `/api/chats/{id}/summarize` | Finish the conversation: write the notes and any actions, and render both into the bound note. **400** if nothing has been said. Running it again re-summarises, which is the retry path when the first attempt was poor |

`PATCH` bodies only need the fields being changed; omitted fields are left untouched.

### Chats and your API key

Chats run on a provider account you own. Five are in the registry in `services/llm.py`:

| Provider | Speaks | Model list |
| --- | --- | --- |
| Anthropic | Anthropic's API | Behind the key, so listing it is proof enough that the key works |
| OpenAI | OpenAI's API | Behind the key, likewise |
| OpenRouter | OpenAI's API, at `openrouter.ai/api/v1` | Public, so saving a key spends one extra 1-token request to prove it |
| OpenCode Zen | OpenAI's API, at `opencode.ai/zen/v1` | Public, likewise |
| Fireworks AI | OpenAI's API, at `api.fireworks.ai/inference/v1` | Behind the key, so no probe is spent |

A table of import paths rather than LangChain's `init_chat_model`, because it is greppable, it
fails at the point of the typo instead of at the first request with a real key, and it can be
checked by a test that has no credentials — which is the only kind of test this can have. Adding a
provider is one row there, plus a package in `requirements.txt` only if it speaks an API nothing
else does; the three OpenAI-shaped ones reuse `ChatOpenAI` and differ only by where the call is
addressed, which is the one thing that must not be forgotten, since the OpenAI client will
otherwise take an OpenRouter key and post it to OpenAI.

Two properties, and they are independent. `api_style` is whose HTTP API it speaks, which decides
the SDK; `lists_publicly` is whether the catalogue is readable without a key, which decides whether
saving one spends an extra 1-token request to prove it. Fireworks is what shows they are separate:
it is addressed like a gateway and gated like a first-party API.

The key is stored encrypted with Fernet, under a key derived from `JWT_SECRET` by HKDF — so there
is no extra environment variable to set, and one consequence worth knowing: **rotating
`JWT_SECRET` makes every stored key undecryptable.** That is already the documented way to sign
everyone out. An unreadable key reads as "no key on file" rather than an error, so the remedy is
the same either way: paste it again.

Nothing sends the key back down. `GET /api/settings/providers` returns four characters of it, and
a provider error that quotes the key back has it scrubbed out before the 502 leaves the backend.

Every provider call is bounded at 60 seconds with a single retry. The chat routes are sync `def`,
so an in-flight call holds a FastAPI threadpool slot shared with every other route in the app:
generous enough for a long summarisation, short enough that one hung provider cannot take the
whole app down.

## 🚀 Getting Started

### Docker (the supported path)

```bash
docker compose up -d --build
```

Frontend on `http://localhost:3700`, API on `http://localhost:8700`. Those host ports are a block
chosen not to collide with anything else on the machine; each is overridable (`FRONTEND_PORT`,
`BACKEND_PORT`) and only the host side moves, so the containers still listen on 3000 and 8000
internally. The backend entrypoint runs `alembic upgrade head` before uvicorn.

The database is **Neon**, not a container, so compose runs two services rather than three and
there is no local volume holding your data.

Configuration comes from `.env` at the repo root, which is gitignored. Copy the template first:

```bash
cp .env.example .env      # then fill in DATABASE_URL, JWT_SECRET and SESSION_SECRET
```

Those three have no defaults and compose refuses to start without them, which is deliberate: a
fallback signing key is not a convenience but a skeleton key for every deployment that forgot to
set one. `JWT_SECRET` must also be at least 32 bytes, or the backend refuses to import.

It sets `DATABASE_URL`, the two host ports, the two secrets (`JWT_SECRET` and `SESSION_SECRET`,
both required, neither with a default), `ENVIRONMENT`, and `DOMAIN` for the production overlay.
Anything you add has to go in this file to reach the container: `docker-compose.yml` forwards
exactly the variables it names into the backend's environment, and nothing else in `.env` crosses
that boundary. Setting one only in your shell does nothing under compose.

No variable here is a credential this deployment spends. Every model call the app makes runs on a
key the reader supplied on `/settings`.

Inside the compose network the frontend reaches the API at `http://backend:8000`. The database is
reached over the internet at the Neon host in `DATABASE_URL`, so the same URL works inside and
outside compose.

Use Neon's **direct** endpoint rather than the `-pooler` one. `entrypoint.sh` runs both
`alembic upgrade head` and uvicorn from this single variable, and migrations don't survive
PgBouncer's transaction pooling. Point dev and prod at different Neon **branches**.

> **Note:** `docker-compose.yml` used to assemble `DATABASE_URL` itself from `POSTGRES_*`, which
> silently overrode whatever `.env` said. It now passes `DATABASE_URL` straight through and fails
> to start if it is unset, so there is no way to end up pointed somewhere you didn't choose.

### Your first account

Registration is invite-only, so the first code has to come from the CLI — there is no account yet
to issue one from:

```bash
docker compose exec backend python -m app.cli issue-invite     # prints a code
```

That code is bound to nobody and works for whoever holds it, which is what you want for the first
account and nowhere else. Pass `--email` to bind one.

**The first account created becomes the superuser**, by any route: the CLI, or registering at
`/register`. That is the only thing that appoints one, so on a fresh deployment make sure the first
person through the door is you. `promote --email` is the way back if that account is ever deleted.

Then register at `/register` with that code, or skip the invite entirely and create the account
from the same CLI, which is already the privileged path — it prompts for the password rather than
taking it as a flag, so it stays out of your shell history:

```bash
docker compose exec backend python -m app.cli create-user --email you@example.com
```

Notes written before there were accounts belong to a seeded `dev@example.com`. Nothing seeds that
user any more, but a database from back then still has one. Move its rows across once, after which
it is gone (and the command is a no-op if there was never one):

```bash
docker compose exec backend python -m app.cli adopt-dev-data --email you@example.com
```

After that, nobody needs the CLI to invite anyone: **any signed-in account can issue a code from
`/settings`**, naming the address it is for. Those codes work only for that address, so one that
leaks or gets forwarded is worth nothing to whoever finds it. Nothing is emailed — the code stays
readable in the issuer's list and sending it on is their business. The superuser additionally sees
every account and every code anyone has issued, on the same page.

`list-invites` shows every code, whether it has been spent, and the address it is bound to
(`anyone` for the unbound ones). `prune-tokens` drops revocation
records for tokens that have expired anyway, which is the only thing stopping that table growing
by one row per sign-out forever.

### Deploying

There are two overlays, and which of them you want depends on whether you are
hardening a machine that has the source on it or running one that does not.

On a machine with a checkout — your own, or a staging box you build on —
the production overlay on top of the base file:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

It publishes **only** Caddy, on 80 and 443. The base file exposes both
services on host ports, which is right on your own machine and wrong on a
public one. (The database is no longer among them: it lives on Neon, behind
Neon's own TLS and access control, rather than in a published container.)
Caddy terminates TLS
and obtains the certificate itself, which needs `DOMAIN` set to a name that
resolves to the machine, and both ports reachable so the ACME challenge can be
answered.

`ENVIRONMENT=production` comes with it, which turns off `/docs` and marks the
session cookie `Secure`. That flag is why the TLS is not optional: browsers
silently drop a `Secure` cookie sent over plain http, so without https login
appears to succeed and no session ever exists.

#### On the server, where there is no source

The base file builds from `./web` and `./backend`. A deployed host has no
checkout — only the three compose files, the `Caddyfile` and `.env` — so
`build` there is not merely wasteful, it is a context compose cannot resolve.
`docker-compose.deploy.yml` removes it and runs published images instead:

```bash
TAG=<commit sha> docker compose \
  -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.deploy.yml \
  up -d
```

`TAG` has no default, on purpose. `dev` moves under you: pulling it twice on
consecutive days gives two different images with no way to name which one is
running, and **an image you cannot name is an image you cannot roll back to.**
So a rollback is the same command with the previous sha, and nothing else:

```bash
TAG=<the sha that worked> docker compose -f ... up -d
```

The images are private, so the host needs `docker login ghcr.io` once with a
token scoped to `read:packages` and nothing else.

#### What publishes them

Nothing deploys automatically. `publish.yml` builds images on pushes to `dev`
— and only after the whole of CI has passed — pushing them to
`ghcr.io/ts-24/restyle-{backend,frontend}`, tagged `dev` and by commit sha. The
sha tag is the one worth pulling, since `dev` moves. `master` publishes
nothing.

> **Careful with migrations.** `entrypoint.sh` runs `alembic upgrade head` on
> every container start, against whatever `DATABASE_URL` is in that machine's
> `.env`. The deployed host must therefore point at a *different Neon branch*
> from the one you develop against, or every deploy migrates the database you
> are working in.

#### Shipping automatically

A push to `dev` runs CI, publishes both images, and then deploys — the `deploy`
job in `publish.yml` opens an SSH session and hands the server one commit sha.

The key that does this **cannot open a shell.** It is named as a forced command
in the deploy user's `authorized_keys`, so whatever the client asks to run is
discarded and only `/srv/restyle/deploy.sh` runs, with the sha arriving in
`SSH_ORIGINAL_COMMAND`. That is the difference between a deploy button and a
root-adjacent credential sitting in a web UI. `deploy/authorized_keys.example`
is the line to copy, and every option on it is explained there.

The sha is validated on both ends, because it is the one value from outside
that reaches a command line. Note the enumeration rather than `[a-f]`: that
range is collation-dependent and matches `A-F` under most locales.

Setting it up on the server:

```bash
# A user that can drive docker and owns the directory, with no sudo.
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG docker deploy
sudo install -d -o deploy -g deploy /srv/restyle

# The three compose files, the Caddyfile, .env, and the script.
sudo install -o deploy -g deploy -m 750 deploy.sh /srv/restyle/deploy.sh

# The key pair. The private half goes into GitHub, the public half here.
ssh-keygen -t ed25519 -f ./deploy_key -N "" -C "deploy@github-actions"
# then write authorized_keys from deploy/authorized_keys.example
```

And in the repo, under Settings → Environments → `production`:

| | Name | What |
| --- | --- | --- |
| Variable | `DEPLOY_HOST` | The server's hostname or static IP |
| Variable | `DEPLOY_USER` | `deploy` |
| Secret | `DEPLOY_SSH_KEY` | The private half of the pair above |
| Secret | `DEPLOY_KNOWN_HOSTS` | `ssh-keyscan <host>`, so the runner pins what it connects to |

The `deploy` job is skipped, not failed, while `DEPLOY_HOST` is unset — so
publishing keeps working until the box exists.

**Rolling back** is the `Publish images` workflow run by hand with
`deploy_sha` set to the sha that worked. There is no shell to type the old
command into, by design, so the button is the way back. `deploy.sh` writes the
sha it deployed to `/srv/restyle/DEPLOYED` and names the previous one when a
deploy fails its health check, which is where you find the sha to put in.

It does **not** roll back on its own. Rolling back automatically would hide
which deploy broke and could flap between two bad images; what an operator
needs at that moment is to be told, loudly, with the sha that was working.

### Frontend checks

They run on the host, and these three are exactly what CI runs:

```bash
cd web
npm run typecheck     # react-router typegen && tsc
npm test              # vitest run
npm run build
```

`typegen` before `tsc` is not optional — the route types every loader imports are generated, and
`tsc` cannot resolve them until they exist. `npm run typecheck` does both in that order.

The one thing to watch is that **CI and the image pin Node 20 while the host is probably newer**,
so a devDependency can install and pass here and still fail on the runner. `jsdom` is held below
30 for precisely that reason: 30 pulls a `undici` that calls `worker_threads.markAsUncloneable`,
which does not exist before Node 22.10, so it installs without a murmur and then cannot start a
worker. To reproduce the runner, install *inside* a Node 20 container rather than mounting the
host's `node_modules`, which holds platform-specific binaries:

```bash
docker run --rm -v "$PWD/web":/src -w /work node:20-alpine sh -c '
  cp /src/package.json /src/package-lock.json /src/tsconfig.json \
     /src/react-router.config.ts /src/vite.config.ts /work/
  npm ci --no-audit --no-fund
  cp -r /src/app /work/app
  node_modules/.bin/react-router typegen && node_modules/.bin/tsc
'
```

To add a dependency without touching the host's `node_modules` at all:

```bash
docker run --rm -v "$PWD/web":/app -w /app node:20-alpine \
  npm install --package-lock-only --save <pkg>
```

### Tests

296 backend tests across 18 modules:

```bash
docker compose exec backend python -m pytest tests/ -q
```

```
........................................................................ [ 24%]
........................................................................ [ 48%]
........................................................................ [ 72%]
........................................................................ [ 97%]
........                                                                 [100%]
296 passed, 2 warnings in 28.34s
```

The suite runs against SQLite, so it needs neither Postgres nor any API key: every provider call
the chat feature makes is mocked. That is also why it is fast. For the same
reason it runs fine outside Docker, from any virtualenv with `requirements.txt` installed — it
wants only `DATABASE_URL` and a `JWT_SECRET` of at least 32 bytes, and `conftest.py` will
`setdefault` both:

```bash
cd backend && .venv/bin/python -m pytest tests/ -q
```

The frontend has 107 of its own, in 8 files:

```bash
cd web && npm test
```

```
 Test Files  8 passed (8)
      Tests  107 passed (107)
```

Two of those files are guards rather than unit tests. `themes.test.ts` fails when
`app/lib/themes.ts` and `app/themes.css` disagree about which palettes exist or which roles they
fill, and `no-hardcoded-colours.test.ts` fails when any component names a Tailwind colour instead
of a role token — on five of the seven palettes a stray `text-zinc-500` is not merely off-brand,
it is a paragraph nobody can read, and no DOM test would catch it.

Because `conftest.py` builds the schema with `Base.metadata.create_all`, the backend suite never
runs a migration and a broken one would pass every test. CI's `migrations` job is the only thing
that catches that, and it round-trips upgrade → downgrade → upgrade against real Postgres.

### Running outside Docker

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn main:app --reload --port 8700
```

```bash
cd web && npm install && npm run dev     # http://localhost:5173
```

Loaders and actions call the backend server-side through `app/lib/api.server.ts`, which reads
`API_URL` and falls back to `http://localhost:8700` — so start the API first. Because the browser
never calls the backend directly, there is no CORS to configure for this path.

## 📌 Project status

The note surface, markdown editing, persistence, chats and themes are wired
end to end. What is not:

- **No chat here has spoken to a real model.** There has never been a provider key on the machine
  this was built on, so everything up to the provider boundary is verified and nothing past it is:
  an actual reply, and an actual summary, have not been observed. What *was* seen is a
  genuine 401 from Anthropic with a deliberately invalid key, so decryption, client construction,
  the request and the error path all work. Saving a key now proves rather more than it used to —
  the provider has to answer with a model list before anything is written, and on the two gateways
  it has to accept a real one-token request as well — so any key that reached the table has
  demonstrably worked at least once.
- **Chat replies arrive whole, not streamed.** A long answer is a long wait with nothing on screen
  but "Thinking…". LangChain's `.stream()` would fix it, but a React Router action returns once,
  so it needs a resource route serving a stream and a reader on the client: a real change, not a
  flag.
- **Finishing is a checkpoint, not an end.** Talking into a finished conversation takes it up
  again and clears its summary columns, because a summary that no longer describes its
  conversation is worse than none. Nothing is lost: the last finish already wrote its prose into
  the note, and the note keeps that until the next finish rewrites it.
- **Signing out of the web app does not revoke the token.** `POST /api/auth/logout` records the
  token's `jti` and refuses it from then on — but the app's own Sign out posts to the *frontend's*
  `/logout`, which only drops the session cookie this server set. Nothing in `app/lib/api.server.ts`
  calls the API's logout route, so the token inside that cookie stays valid until it expires and
  revocation is reachable today from `curl` and `/docs` rather than from the button.
- **A password is reset by handing someone a link, not by them asking for one.** The superuser
  issues it from the account page — or from `python -m app.cli issue-reset --email <addr>` when the
  superuser is the one locked out — and passes it on. It works once, expires in an hour, and using
  it signs out every session the account already had. Nothing is emailed, for the reason invites
  are not: this app stays off the end of a mail provider, and nobody can make the server send mail
  to an address of their choosing. There is still **no way to change a password while signed in** —
  `PATCH /api/users/me` accepts a username and an email and nothing else.
- **There is no refresh flow.** A token nobody revokes stays valid for its full seven days.
  Rotating `JWT_SECRET` invalidates every session at once — and, because the credential cipher is
  derived from it, orphans every stored provider key along with them.
- **Both ghost cards still write a row on click**, before anything is typed — but the row no
  longer outlives the visit. A new note is created nameless (`title = ""`; `Untitled` is
  placeholder text in the field, never a value), and leaving one that was never written in
  deletes it, along with a bound conversation that got nowhere. Two notes are spared on purpose:
  your last one, because the app has no empty state, and any note whose chat has messages.
- **`alembic check` cannot be used as a drift gate.** `invite_codes` and `revoked_tokens` were
  migrated with a unique *constraint* plus a plain index, while their models declare
  `unique=True, index=True`, which SQLAlchemy renders as a unique *index*. Functionally identical,
  and the round-trip job passes, so nothing is broken — `check` simply reports drift that is not
  there.
- **The old `.env` is still in git history.** The tracked copy is gone and `.env` is ignored now,
  but this repo is public, so the Postgres password that was in it is permanently exposed. It has
  been rotated, and `DATABASE_URL` no longer has a hardcoded fallback, so the leaked value is dead.
  No history rewrite was done.

`PROGRESS.md` carries the full open-items list and 34 documented traps that cost real time — read
it before touching the UI. Both it and this file were last checked against the code on 2026-08-20,
on `feature/three-more-palettes`.
