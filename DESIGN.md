# Restyle — Design Direction

The visual brief for the app. Anything new in `web/app/` should be able to point at
a rule in here.

Status: §§3–5 (type, colour, hierarchy) are **applied**, and the colour ramp in §4 is now a set of
role tokens that several palettes fill (`web/app/themes.css`). §6 (ornament) is **specified but
unbuilt**. §12 tracks what remains.

---

## 1. The brief

> Right now it feels very AI-startup. It should feel **open, clean, simple yet bold**,
> using **serifed fonts, not sans-serif**, with **well-defined headers**, but cool,
> **differentiated UI elements that don't rely on solid lines and colour breaks** for
> visual hierarchy — make **better use of whitespace** instead.

Read it as: *editorial, not dashboard.* A page of notes should read like a well-set book
page, not a SaaS console.

---

## 2. Reference

The agreed visual target is the vocabulary-card mockup: warm cream ground, deep indigo serif
setting, a single dusty-rose surface carrying the focal content, uniformly-tinted nav chips
with rose hairlines, and — the part that makes it — **fine line-art drifting behind everything
at roughly a tenth of full contrast**.

Where §§3–11 below contradict an earlier draft of this document, the reference wins. Three
rules changed as a result:

| Earlier rule | Revised |
| --- | --- |
| Accent used on ≤5% of a screen | The accent is a **surface**: one large accent block per view is correct |
| Restrained radius, no pills | Generous radii; pills fine for small segmented controls |
| No borders on surfaces | Hairlines are fine **when uniform** — see §5 |

---

## 3. Typography

The single biggest change from today. Current state: everything is Inter, body copy at
`text-xs` (12px). That combination *is* the AI-startup look.

### Families

| Role | Family | Package (verified on npm) |
| --- | --- | --- |
| Display / headers | **Playfair Display Variable** | `@fontsource-variable/playfair-display` |
| Body / UI | **EB Garamond Variable** | `@fontsource-variable/eb-garamond` |
| Numeric | system mono stack | — |

Playfair matches the reference's high-contrast quote setting — ball terminals, strong thick/thin
modulation. EB Garamond gives the warm oldstyle body and the italics the reference leans on for
meta lines. Substitutes if either proves wrong in situ: `@fontsource-variable/fraunces` (softer,
more idiosyncratic display) or `@fontsource-variable/newsreader` (more neutral body).

Wire them in `web/app/app.css`: drop the Inter import, replace the `--font-sans: "Inter"`
token in `@theme` with `--font-serif` / `--font-display`, and repoint `html { @apply font-sans }`.

### Scale

EB Garamond has a small x-height, so sizes run larger than a sans equivalent.

| Token | Size / leading | Use |
| --- | --- | --- |
| Display | 44px / 1.15, Playfair 500 | The featured quote |
| Section | 26px / 1.2, Playfair 500, +0.06em | Section and card headers ("Alacrity") |
| Card title | 19px / 1.3, Playfair 500 | Note titles |
| Body | 17px / 1.55, Garamond 400 | Note content, definitions, the editor |
| Meta | 14px / 1.4, Garamond 400 *italic* | Attributions, dates, hints |
| Nav | 15px / 1, Garamond 400, **+0.18em** | Sidebar items |

Two idioms from the reference worth naming: **italic serif for every meta line** (dates,
attributions, example sentences), and **wide tracking on nav** — tracked-out serif at a readable
size, which is a different thing from a 10px uppercase micro-label.

**No uppercase micro-labels.** `text-[10px] font-bold tracking-wider uppercase` currently sits on
every section header and is the most SaaS-coded pattern in the app. Replace with a real serif
header at Section size. Never set body below 15px. Emphasis inside a quote is a **weight** shift
(the bolded "alacrity"), never a colour or a highlight.

---

## 4. Colour

Sampled from the reference; tune by eye and convert to `oklch` to match the existing token
system in `app.css`.

| Token | Approx. | Use |
| --- | --- | --- |
| `paper` | `#FDF7F1` | Page ground. Warm cream, never white |
| `paper-raised` | `#F3EAE5` | Nav chips, quiet surfaces |
| `ink` | `#38385A` | All primary text. Deep indigo, not black |
| `ink-muted` | ~65% `ink` | Secondary text |
| `ink-meta` | ~45% `ink` | Dates, hints |
| `rose` | `#CE8380` | The accent **surface** |
| `rose-ink` | `#B26A76` | Accent text: links, attributions, meta emphasis |
| `hairline` | `#E3C9C4` | 1px rose-tinted edges |
| `on-rose` | `#FFF9F5` | Text on the accent surface |
| `ornament` | `#9A9188` @ 8–12% | Background line art (§6) |

Rules:

- **One accent surface per view.** The rose block carries the focal content; everything else is
  cream and ink. Two rose blocks on one screen is one too many.
- **No gradients. No glassmorphism.** Drop `backdrop-blur-xs` from the note card.
- **One neutral ramp, warm.** The current cool slate/zinc mix reads clinical.
- Dark mode is the same ramp inverted — cream becomes a deep warm brown-black, rose desaturates
  slightly, ornament opacity rises to 10–14%.

### Radius

12–16px on chips and controls · 20–28px on large surfaces · full pill **only** for small
segmented controls (the nouns/verbs/adjectives switcher). The composer's full-width
`rounded-full` pill is not that, and comes down.

---

## 5. Hierarchy without lines

In the order to reach for them:

1. **Space.** Section gap ≥ 64px. Card padding ≥ 28px. Header-to-content ≈ 16px, so a header
   clearly belongs to what follows.
2. **Scale and weight.** 26px Playfair against 17px Garamond is unambiguous with no rule under it.
3. **Tone of ink.** Three levels of the *same* hue: primary, muted, meta.
4. **Paper tone.** One step off the page ground, never two.
5. **Alignment.** A shared left edge groups more quietly than a box.
6. **Elevation, sparingly.** Shadow marks the *state* of being lifted — the expanded note — not
   every card.

**On hairlines.** The reference does use them, and this is not a contradiction: the nav chips are
*identically* bordered, so the border carries no hierarchy signal — it is rhythm and texture. The
rule is therefore: a hairline may exist when it is uniform across a set. The moment a border,
a fill, or a colour is what tells you which item matters, it is doing type's job. Hairlines stay
at the `hairline` token, inset from content, never a full-strength `border-*`.

**Retired:** card borders (`border border-slate-200`), the toolbar rule (`border-t
border-zinc-950/5`) in `notegrid.tsx`, and the header/footer rules on the expanded note. All
three became whitespace. Done.

---

## 6. Background and ornament

The Starry Night layer. This is the signature of the theme and the easiest thing to overdo.

**What it is:** not the painting, and not colour. It is the painting's *line vocabulary* —
the spiral field, the cypress flame, the bundled stroke — drawn as fine single-weight line art,
like an etching or a pencil study, sitting behind the content at roughly a tenth of full
contrast. In the reference: one spiral cluster upper-right, one botanical bundle rising through
the left of the column and again bleeding off the bottom.

**Rules:**

- **Stroke only.** No fills, no shading, no colour. 0.5–0.75px at 1×, `vector-effect:
  non-scaling-stroke` so it stays hairline when the SVG scales.
- **8–12% opacity** on cream, 10–14% in dark mode. If you can read it as a picture, it is too
  strong; it should register as texture and only resolve when looked at.
- **Always cropped.** Every motif bleeds off at least one viewport edge. A centred,
  fully-visible illustration breaks the effect instantly.
- **Two motifs per viewport, maximum.** The reference has exactly two zones.
- **Off the reading column.** Anchor to corners and outer margins. Where a motif must pass under
  text, thin it to ≤6% there. It never crosses the accent surface — that block is opaque.
- **Static by default.** If drift is ever added: ≤8px, ≥20s, and off under
  `prefers-reduced-motion`.
- **Inert:** `pointer-events-none` and `aria-hidden="true"`, always.

**Implementation:** inline SVG components under `web/app/components/ornament/`, composed by
one `<Ornament />` layer mounted **once in the root layout, above the route outlet** — not per
route and not per card. It must survive navigation without re-mounting; that persistence is
load-bearing (§9, rule 2). Strokes use `currentColor` so a single opacity token drives both
themes. Position absolutely inside the page wrapper; put `overflow-hidden` on the layout element,
not on a scroll container. Below ~640px, drop to a single motif or none.

**Do not use raster art.** Hairlines at 10% opacity band badly in JPEG/PNG and cannot be
recoloured for dark mode.

**Sourcing:** *The Starry Night* (1889) is public domain, so line derivations are unproblematic.
Options, best first: commission or trace a small set of three or four SVG motifs (spiral field,
cypress, wheat bundle); public-domain 19th-century etching and botanical plates; or generate the
spiral clusters programmatically as concentric offset spirals with jitter — good for the swirls,
poor for the cypress, which needs a real hand.

---

## 7. Spacing

8px base unit; prefer the large end.

| Context | Value |
| --- | --- |
| Between sections | 64–80px |
| Header to its content | 16px |
| Card padding | 28–32px |
| Grid gutter | 24px |
| Inside a control | 8px / 12px |

Page gutters generous enough that the notes column never touches the sidebar or the window
edge — the "open" quality in the brief is mostly this, plus §6 having room to breathe.

---

## 8. Components

**Note card** — no border, no blur, no shadow at rest. One step of paper tone, generous padding,
Playfair title, Garamond body, italic meta date with real space above it. Hover raises ink
contrast; it does not add a box.

**Focal surface** — the rose block. Carries whatever the view is *about* (the expanded note, the
featured word). Generous radius, `on-rose` text, opaque over the ornament layer.

**Segmented control** — cream pill on the accent surface, Garamond at Meta size, active item by
ink weight. The one place a pill is correct.

**Note actions** — icon-only, low-contrast, revealed by opacity, no rule above them.

**The note surface** (`app/workspace/note-surface.tsx`) — one element in two modes. `page` is the
bare hero on `/`; `boxed` takes the full column width on `/notes` and the other notes reflow
around it. `boxed` is the one place a shadow is correct, because it genuinely is lifted. Header
and footer separate from the body by space, not rules.

**Composer** — de-pill it. Same paper tone as a card, 16px radius, serif placeholder at Body size,
no ring, no gradient button.

**No sidebar, no nav bar.** Removed outright — see §9. Where a view needs an exit, it is one
quiet serif link at the head of the column, at Meta size. Never a persistent rail.

**Empty state** — one confident serif line with space around it. No icon-in-a-circle.

---

## 9. Navigation

**Philosophy.** Navigation should feel *led*, not chosen from a menu. The user is inside one
continuous place and is carried through it — never handed a list of destinations and left to
teleport between them, and never made to feel they have stepped outside the app to get
somewhere. Three references, each contributing one thing:

- **Apple's product pages** — the page has a point of view. It knows what you should see next
  and it takes you there. You are not asked to choose; being led *is* the experience.
- **Google Maps** — it proposes a route, and keeps proposing. You can deviate at any moment, but
  you are never left staring at a blank map wondering what to do. Orientation is continuous: you
  always know where you are relative to where you were.
- **The Dynamic Island** — it responds to touch without being puppeted by it. Input starts a
  motion; the interface finishes it with its own physics and settles into a state of its own
  choosing. Responsive, but not a controlled thing.

Flow is the sum of the three: **the app proposes, the user disposes, and nothing ever cuts.**

### Rules

1. **One continuous surface.** Routes are regions of a single space, not separate pages. A route
   change re-composes what is on screen; it never tears the screen down and rebuilds it. No white
   flash, no full-page spinner, no skeleton wipe.
2. **The constant proves it.** The ornament layer (§6) and the page ground persist across every
   route, unmoved. They are the evidence that the user never left. Nothing that persists may
   re-mount on navigation.
3. **Identity carries.** The thing acted on becomes the thing being looked at — shared element
   first, fade last. The expanded note already works this way; it is the same rule.
4. **Direction encodes relationship.** Deeper moves one way, back reverses it exactly, siblings
   move laterally. A view must never arrive from a direction it cannot leave by.
5. **Every view proposes the next move.** There is always a most-likely onward step, and it
   carries weight — position, size, ink. The full map stays available and quiet. A view with no
   proposal is a dead end, and dead ends are what make an app feel like a website.
6. **Input is interpreted, not tracked.** A gesture or a scroll sets a motion going; the interface
   completes it and settles into a real state. Never freeze mid-way where the finger stopped.
   Scroll may drive a sequence, but it must never fight the user's scroll — no speed hijacking,
   no trapping.
7. **The active marker travels.** One marker moves between nav items (shared `layoutId`), rather
   than one vanishing and another appearing. Movement, not replacement.
8. **Chrome recedes with depth.** Navigation is ambient while the user is engrossed and returns
   on intent. It is never the loudest thing on screen.
9. **Latency is choreography.** React Router keeps the current view live while the next loads —
   use that. A pending navigation is a quiet progress hint (`useNavigation`), never a blocking
   spinner. If data is slow, the old view stays, and stays interactive.
10. **No overlays on top of the app.** Modals and dialogs remove the user by definition. Expand
    in place, in flow, as the note editor does.

### The entry point

The experience starts on the landing page, not in a list. The user is met by the note they were
last studying, set as a hero: its title as the main header, its text beneath. Both are live —
clicking into the header reveals a blinking cursor *in the header itself*. The page is not a
preview of the note, it **is** the note.

That is the whole of "engrossing": there is one thing on the screen, it is theirs, and nothing
around it announces that they are operating a website.

**Double-clicking the hero text carries the user to `/notes` with that note already open** in the
expanded state from §8 — the same gesture that expands a note in the grid, so the vocabulary is
consistent across the app. Closing it there drops them into the rest of their notes, so the grid
is *discovered* rather than presented. That is the whole spine of the app:

> hero → (double-click) → the note, open → (close) → everything else

### Where friction is correct

Frictionless is not the goal everywhere. Destructive and irreversible actions should *hold* — a
beat of resistance, a confirmation that costs a moment. Flow is for movement; weight is for
consequence.

### For this app

The app has **no sidebar and no nav bar**; they were removed, not hidden. Travel is the spine
above. Beyond it, the reading path is the navigation: a note leads to the vocabulary inside it,
a word to the sentences that use it, a sentence back to its note. Each view carries exactly one
quiet way back out, and nothing more.

---

## 10. Motion

Calm and quick. The layout transition is settled and should be reused rather than re-invented:
`NOTE_LAYOUT_TRANSITION` in `web/app/workspace/note-surface.tsx` —
`{ type: "tween", duration: 0.55, ease: [0.4, 0, 0.2, 1] }`.

- Tweens, not springs. Springs wobble as they settle even at `bounce: 0`.
- One thing moves at a time; when several must move, they share one curve.
- Hover: 150–200ms, opacity and ink only — no lift, no scale.
- Respect `prefers-reduced-motion`: fall back to a cross-fade.

---

## 11. Anti-patterns

If a screen trips three or more, fix it.

- [ ] Uppercase micro-labels with wide tracking
- [ ] 12px grey body copy
- [ ] Bordered card + subtle shadow + background tint, all at once
- [ ] `backdrop-blur` used decoratively
- [ ] Gradient buttons or gradient text
- [ ] A full-width pill as a text input
- [ ] A divider wherever two things sit next to each other
- [ ] Icon-in-a-circle empty states
- [ ] The active nav item marked by a *differently* filled block
- [ ] Springy, bouncy motion
- [ ] Cool grey-blue neutrals
- [ ] Ornament strong enough to read as a picture, or centred and uncropped
- [ ] A route change that flashes, wipes, or spins
- [ ] Navigation by menu only, with no proposed next step
- [ ] A modal or dialog stacked over the app
- [ ] Scroll speed hijacked, or the user trapped in a section
- [ ] An active marker that appears rather than travels
- [ ] "Back" landing somewhere the user has never been
- [ ] A persistent nav rail, sidebar, or top bar
- [ ] A landing page that presents a list instead of the user's own work

---

## 12. Migration checklist

### Done

- **`app/app.css`** — serif imports and `--font-*` tokens in; the cool slate ramp replaced with
  the warm paper/ink/rose set from §4; radius raised.
- **`app/notes/notegrid.tsx`** — uppercase micro-labels replaced with Playfair section headers;
  `border`, `shadow-xs` and `backdrop-blur-xs` dropped from the cards; toolbar rule became
  whitespace; body type raised off `text-xs`.
- **The expanded note** — rules became whitespace, type moved onto the serif scale, the lift
  shadow and the layout transition kept. It is now a mode of `app/workspace/note-surface.tsx`
  rather than its own component.
- **The composer** — de-pilled. `notemaker.tsx` is gone; creation is the ghost `+` card in the
  grid.
- **The sidebar** — `app/components/app-sidebar.tsx` deleted outright, along with `welcome.tsx`
  and the `SidebarProvider` / `SidebarInset` wrapper in `app/root.tsx`.
- **Route transitions** (§9 rules 1–3) — solved structurally rather than with a wrapper. `/` and
  `/notes` are children of a layout route, so the note surface never unmounts and there is
  nothing to transition between. See `PROGRESS.md` §3.
- **The two ghost cards** — `app/notes/ghost-card.tsx` is one component with a `tone`, used for
  both the `+` that starts a note and the twin that starts an AI chat. Colour is the only
  difference, and both tones are existing tokens (§4): rose for the note, ink for the chat. No
  third hue was introduced — a new one would need a place in the ramp and a dark-mode
  counterpart, and the two the theme already has are as distinguishable as anything invented.
  One accent surface per view still holds: the rose here is a dashed hairline, not a block.
- **The chat surface** (`app/chat/chat-surface.tsx`) — the boxed note's chrome reused verbatim:
  radius, raised paper, shadow, reading column, and the footer with its single rose action.
  It departs only where a dialogue departs from prose. The note is centred because
  `text-align` cannot be tweened (`PROGRESS.md` trap 4); a chat has no such constraint and is
  ranged left, with the reader's own turns indented onto the page's paper. That step of tone is
  what marks the change of speaker — no bubble outline, no avatar, no second accent.
- **`/settings`** — no longer a placeholder. The AI provider section follows the house form for a
  form: hairline-underlined fields, Meta-size labels, one bordered button, the exit as a single
  serif line at the head of the column. The theme picker reuses that same form.
- **Themes** (§4) — the ramp is ten role tokens (`paper`, `ink`, `accent-surface`, `danger`,
  `scrim`, …) defined per palette in `web/app/themes.css` and selected by `data-theme` on
  `<html>`, resolved from a cookie in the root loader. Paper is the palette above; Everforest Light,
  Rosé Pine Moon, Nord, Everforest Dark, Tokyo Night and Catppuccin Mocha are ports. Adding one is a
  CSS block plus an entry in `app/lib/themes.ts`.
  This also finished the two things blocking it: `components/ui/*` now sit on the tokens, and no
  component names a raw colour (a test enforces it).

### Remaining

In dependency order:

1. **`app/components/ornament/`** (§6) — unbuilt, and the blocker is assets: it needs real SVG
   line art, not code. Motif SVGs plus an `<Ornament />` layer mounted once in `app/root.tsx`
   above the route outlet so it survives navigation (§9, rule 2).
2. **`/settings`** — never through §9's navigation rules. (`/analytics` was the other page in
   this position; it went with the vocabulary analysis.)
3. **Directional navigation** (§9, rules 4 and 9) — the layout route removed the tearing, but
   nothing yet encodes *direction*, and there is no pending-navigation hint.
4. **Onward links** (§9, rule 5) — a note should propose the next step in the reading path.
   This is a data question as much as a layout one, and it lost the spine it was drawn around:
   the note-to-word relation went with the vocabulary analysis, so what a note leads to now is
   another note or its own conversation.
