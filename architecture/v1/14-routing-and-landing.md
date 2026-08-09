# Routes, a front door, and a page to start from

**Batch 8.** Design document for **WP-30** and **WP-31**. Decision: **ADR-40**. **Both are
built.** Two deviations, recorded where they happened: the static pages sit at the **repo root**
rather than in a `landing/` folder (§7), because Rollup names its outputs after the input path and
`landing/index.html` would build to `dist/landing/index.html`; and `/maps` has **no separate empty
state** (§4.2), because while the redirect is unconditional it is unreachable — the redirect *is*
the empty state, and P2 adds the surface with the second precondition that makes it reachable.
**Prerequisite:** WP-22 (the gallery this batch turns into a page) and **WP-23** (the generate
form the create page reuses — which is why `11-editor-shell.md` ships in two packages, see §7).

The editor has no routes at all. `App.tsx` is the whole application, one URL is the whole
address space, and the only way to reach a second map is a dialog. This document gives the app
a route table, turns the gallery into a page, adds a page you start a map from, and puts a
static landing page in front of the lot.

**None of it needs a host.** The deploy is a separate, unfinished thing (WP-13) that needs a
domain; every package here is built and driven at `localhost`.

---

## 1. What is missing

| | Today | Consequence |
|---|---|---|
| Address space | one URL | a map cannot be linked, bookmarked, or opened in a second tab |
| Which map is open | a localStorage id ([useAutosave.ts:70-73](../../src/persistence/useAutosave.ts#L70-L73)) | the app has to *remember* what the URL could simply *say* |
| Switching maps | a modal over the editor | reads as lightweight, while the model treats it as a hard boundary |
| Starting a map | a button that mints a scene and drops you in it | canvas size is picked from a menu that destroys the map when used later |
| Arriving | nothing | no indexable prose anywhere, and ADR-04 asks for a prerendered landing page |

**The tell is the third row.** ADR-35 already establishes that switching maps **clears the undo
stack**, because a step carries scenes belonging to the map that produced them. That is a
navigation in everything but presentation. A modal says "this is a small thing you can back out
of"; the model says the opposite.

**And the fourth row is worse than it looks.** `resetCanvas(preset)` is a single action doing
double duty — it is both *Reset canvas* and *change canvas size*, and it throws away every
object, keeping only `meta.id`, `createdAt` and the title
([editorStore.ts:380-401](../../src/state/editorStore.ts#L380-L401)). That is why ADR-36 gives
`Canvas size ▸` a confirm. **Canvas size is free exactly once, at creation** — and there is
currently no screen at creation on which to offer it.

## 2. The rule this document applies

> **The menu bar owns *this* map. The gallery owns *which* map.**

It is ADR-36's rule one level out. That document sorted controls by *kind* — a menu holds
commands, a rail holds live state. This one sorts them by *scope*: everything that acts on the
document in front of you stays in the chrome around it, and everything that chooses between
documents lives on a page of its own.

Two consequences, both of which remove controls rather than add them:

- **`New map` and `Open Map…` leave the menu bar.** They are "which map" commands; the gallery
  page holds both. The `Map` menu lands on four items that are all about the map you are looking
  at. See **D4**.
- **`Canvas size` gains a second, non-destructive home.** On the create page it is a free choice;
  in the `Map` menu it stays exactly what ADR-36 designed — a radio submenu behind a confirm,
  because by then it empties the map.

## 3. The route table

| Route | Served by | Package |
|---|---|---|
| `/` | static HTML | WP-31 |
| `/how-it-works` | static HTML — **reserved, shell only** | WP-31 |
| `/maps` | SPA — the gallery, titled **Your maps** | WP-30 |
| `/maps/create` | SPA — the setup page | WP-30 |
| `/maps/edit/{uuid}` | SPA — the editor | WP-30 |
| 404 | static HTML (unknown path) · in-app redirect (unknown uuid) | WP-30 / WP-31 |
| `/auth/callback` | SPA, lands on `/maps` | P2 |
| `/api/*` | Go, same-origin (ADR-34) | P2 |
| `/s/{slug}`, `/embed/{slug}` | **Go**, SSR meta | P2 |

**One origin.** `map.byfauzi.com` serves all of it. ADR-34 promises `/api/*` stays same-origin so
P2 arrives as three lines of Caddy config instead of a CORS policy; an app subdomain would throw
that away and buy nothing, because the URL does not move the bytes. See **D1**.

**`/s/*` and `/embed/*` must match before the SPA fallback**, or the fallback swallows Go's
routes. Worth writing into the Caddy file with a comment now, while the fallback is being added,
rather than discovering it at P2.

**`/edit` does not exist and is not redirected.** Nothing is deployed, so no URL is load-bearing
yet, and supporting two spellings of one route from day one is how an address space rots.

## 4. WP-30 · The routes

### 4.1 The router is hand-rolled

Four SPA routes, one parameter, no nesting. `location.pathname` + one regex + `pushState` /
`replaceState` + a `popstate` listener covers it in about thirty lines, plus a `<Link>` helper
(§4.6). No new dependency.

This is the same call the repo made for IndexedDB (raw, no wrapper — WP-12) and for driving a
browser (CDP over a `WebSocket`, no Playwright — `07` §1). **The trigger to revisit it** is P2
adding nested or guarded routes, or a *measurement* showing route-level code splitting is worth
having. Not before.

**Three things the primitive does not give you**, which this package therefore owns: per-route
`document.title`, scroll restoration when Back returns to `/maps`, and focus management on
navigation. A hand-rolled router that skips all three is why hand-rolled routers have a
reputation.

**Dev and production hold the same rule in two places.** Vite's default `appType: "spa"` falls
back to the root `index.html`, which would serve the **landing page** at `/maps/create`;
`appType: "mpa"` serves HTML by literal path, so `/maps/create` 404s. What is needed is `"mpa"`
plus a ~10-line `configureServer` middleware rewriting `/maps*` to the app entry — and the same
for `vite preview`. That middleware is the local mirror of the Caddy config, and **they must
agree**. "Works locally, 404s in production" has exactly one signal, and it is a deploy.

This is not optional polish: **every CDP driver in the repo runs against the dev server**
(`07` §1), so if dev routing is wrong, nothing in this batch can be verified at all.

### 4.2 `/maps` — the gallery becomes a page

WP-22's `MapGallery` stops being a modal and becomes the page at `/maps`, titled **Your maps**,
with larger thumbnails. New map · open · rename · delete all port across unchanged; *open*
becomes a navigation.

**It is now load-bearing navigation, not a convenience.** As a modal it could assume a map was
already open. As the only way to switch maps it must handle arriving with nothing — so it needs
an **empty state**, which is a surface it never had.

**And the empty state resolves itself into the create page.** When the list is empty *and the
answer is known*, `/maps` `replaceState`s to `/maps/create`. `replaceState`, not `pushState`,
or Back from the create page returns to `/maps`, which redirects to `/maps/create` again —
**a Back button trapped in a loop.** With the replace, `/maps` never enters history when it
redirects, and Back reaches the landing page.

The list is an async IndexedDB read, so the gallery must not render before it resolves, or a
first-time visitor sees an empty grid flash before the redirect.

**At P2 the redirect gets a second precondition and it is not optional.** A logged-in user with
five cloud maps and no local drafts must never be told to create their first map. "Empty" then
means *both sources empty and both known* — if the API call fails or the browser is offline, show
the gallery with an error state and **do not redirect**. Guessing wrong here is the worst
failure this page has.

**Naming.** ADR-36 renamed "My maps" to `Open Map…` because a *command label* would be ambiguous
about whose and where once cloud maps join it. A page heading is not a command, and a possessive
noun is the convention everywhere (`Your repositories`, `My Drive`), so the page is **Your maps**
and the ADR-36 reasoning is untouched — the label it objected to is the one being deleted.

### 4.3 `/maps/create` — a page, not a redirect

A persistent setup page, in two steps:

```
┌────────────────────────────────────────────────┐
│  Start a new map                               │
│                                                │
│  Canvas       [Landscape]  ( Square )  ( Portrait )
│               4000 × 3000                      │
│                                                │
│  [ Blank canvas ]        [ Generate a world ▾ ] │
│                                                │
│  ┌─ when Generate is chosen ──────────────────┐ │
│  │  World code   w1-483920104-0.40-…   [paste]│ │
│  │  ── or configure ──                        │ │
│  │  Land amount  ──●───   Roughness  ──●───   │ │
│  │  World type   ( single ) ( archipelago ) … │ │
│  │  ▸ Advanced                                │ │
│  │                        [ Generate world ]  │ │
│  └────────────────────────────────────────────┘ │
└────────────────────────────────────────────────┘
```

**Canvas type defaults to landscape** (**D6**). The option is right there and costs one click to
change, so a default makes the blank path a single click rather than two. In the `Map` menu the
radio's default is *the size you are currently on*, which is ADR-36's existing `data-preset-active`
behaviour — unchanged.

**The generate form is one component in two containers**, not two forms. WP-23 builds it as the
generate dialog; this page mounts the same thing. The difference is exactly the branch WP-23 §5.1
already specifies:

| Container | Scene | Primary button | Warning line |
|---|---|---|---|
| create page | always empty | **Generate world** | none |
| `Map → Generate world…` | may have objects | **Replace map** when non-empty | when non-empty |

**Canvas size is not in the world code, and that is why this order works.** WP-23 §5.3 excludes
canvas size and `coastDetail` from the code deliberately — "a code should not resize someone's
canvas." This page picks the canvas *first and separately*, then optionally accepts a code that
fills in everything else. The exclusion stops being a caveat and becomes the reason for the
sequence.

**Generation runs in the editor, after the navigation** (**D7**). Clicking Generate mints the
scene, navigates to `/maps/edit/{uuid}`, and the world arrives there through the existing path
with its existing "Generated N landmasses" toast. The user sees the application sooner, and no
second loading state is invented for 250–420 ms of worker time (WP-10's measurement).

**Completing the page `replaceState`s; arriving at it `pushState`s.** Either button mints the
scene and **replaces** this entry with `/maps/edit/{uuid}`, because a setup step you have finished
is not a Back target — Back should reach whatever sent you here. `New map` pushed on the way in
(§4.6), so the history reads `[…, editor, newEditor]` from the editor and `[/maps, editor]` from
the gallery. Both are what Back should mean.

**Abandoning the page leaves nothing behind.** Back out without choosing and the entry is still
`/maps/create`, unreplaced, with no scene minted and no draft written — and Back from there
returns to the map you were editing, undo stack intact (§4.4).

**Nothing is written to IndexedDB until the user clicks through.** The page is a deliberate gate,
so a visitor who arrives and leaves creates no draft. This is the reason the create page is a
page rather than the mint-and-redirect it was first drafted as: a redirect would have written an
empty draft for every bounce off the landing page.

### 4.4 `/maps/edit/{uuid}` — the URL is the source of truth

`meta.id` is already the IndexedDB keyPath (WP-22), so the route parameter *is* the key and there
is no lookup layer to add.

The route handler has one rule, and it is the lazy one:

> On entering the route, **if `store.scene.meta.id === uuid`, do nothing.** The scene and its
> history are already correct. Otherwise `loadScene(uuid)` → `openScene()`, which clears the
> undo stack, correctly, per ADR-35.

`useEditorStore` is a module-level singleton, so it survives a component unmount. That check is
therefore what makes **Back from the create page return you to your map with undo intact** — and
it is less code than reloading unconditionally.

**Opening by URL must not go through the restore path.** `restore()` refuses when
`past.length > 0` ([useAutosave.ts:85](../../src/persistence/useAutosave.ts#L85)), which is right
for a boot race and wrong for a deliberate navigation.

**`rememberedOpen()` and the `loadLatestScene()` fallback are deleted.** They exist so a reload
restores the map that was open; the URL answers that now, and a returning user's own history
holds the address. This package removes a localStorage key and a fallback branch rather than
adding one.

**An unknown or malformed uuid redirects to `/maps` with a toast, and never mints a map with that
id** — otherwise a stale bookmark resurrects a deleted map. ADR-30's fail-loudly rule, applied to
an address instead of a path string.

### 4.5 Two kinds of not-found

- **Unknown path** (`/edit`, `/mapz`) → a **static** 404 served by Caddy. Never loads the SPA.
- **Unknown uuid** → the SPA is already running, so this is in-app: redirect to `/maps` with a
  toast.

### 4.6 Every navigation is a real link

One `<Link>` helper (~15 lines), used for the brand mark, the gallery cards, and `New map`:

| Click | Behaviour |
|---|---|
| plain left click | `preventDefault()` → `await flush()` → `pushState` → render |
| Ctrl/Cmd/Shift-click, middle-click, right-click → *Open in new tab* | **do not** `preventDefault()` — the browser handles it and this code never runs |

The new-tab case needs no flush: the original tab stays open and its autosave keeps running.

**`New map` navigates to `/maps/create` with `pushState`**, so Back returns to the map you were
editing. It appears on the gallery page and — because it is a link, not a duplicated surface — is
reachable from anywhere the brand mark is.

**The brand mark `[M]` links to `/maps`.** With `Open Map…` gone this is the way back, and it
matters more than it sounds: Back only works if you *arrived* from `/maps`, which a bookmark
straight to `/maps/edit/{uuid}` did not, and neither did a create page that replaced its own
history entry.

### 4.7 The four traps

Each of these is a one-line mistake with a delayed, confusing symptom.

| # | Trap | Symptom |
|---|---|---|
| 1 | `pushState` instead of `replaceState` when the create page completes | Back lands on a setup page you already finished; completing it again **mints a second map** |
| 2 | `pushState` on the empty-`/maps` redirect | **Back is trapped in a loop** between the two routes |
| 3 | `location.assign` anywhere instead of `pushState` | full document reload — a visible blink, and the editor bundle paid for twice |
| 4 | Client-side navigation without flushing autosave | **the last ≤800 ms of edits are lost** |

Trap 4 is the one that costs work. Autosave throttles at 800 ms and flushes on
`visibilitychange` / `pagehide` ([useAutosave.ts:111-117](../../src/persistence/useAutosave.ts#L111-L117))
— **neither of which fires on a route change.** Every client-side navigation away from the editor
has to call the same `flush()`. If the write fails, autosave already raises its own toast
([useAutosave.ts:58](../../src/persistence/useAutosave.ts#L58)); navigate anyway rather than
building a blocking dialog for it.

### 4.8 Two tabs on one map

Linkable map URLs make two tabs on the same `/maps/edit/{uuid}` easy, and both autosave to the
same IndexedDB key with **no version check** — last write wins, silently. ADR-33 specifies an
optimistic version check, but only for the cloud `PUT`; the local path has no equivalent and
never has.

**Decision (D8): detect and warn.** A `BroadcastChannel` (native, no dependency) announces the
open uuid; a tab that hears its own uuid from another tab shows a banner. Roughly fifteen lines.

Not "accept and document", because the failure mode is losing work with no signal, and error
handling that prevents data loss is the one category that does not get simplified away. Not
"block the second tab", because a two-monitor workflow is legitimate and read-only is a bigger
promise than this needs.

### 4.9 What leaves the editor

`Map` menu, after this batch — four items, all about the map in front of you:

```
Map ▾
  Canvas size    ▸     radio submenu, confirm on change (ADR-36, unchanged)
  Reset canvas…
  ──────────────
  Generate world…
  Export image…
```

**The reset dialog absorbs a hint that dies with the rail.** `MapPanel`'s
*"A new map keeps this one — both live in My maps. Reset empties this one."*
([MapPanel.tsx:256](../../src/ui/MapPanel.tsx#L256)) is currently the only place that
distinction is explained, and *"Changing the canvas size empties this map"*
([MapPanel.tsx:283](../../src/ui/MapPanel.tsx#L283)) has nowhere to live once the presets are a
submenu. Both go into the confirm, which is the last moment before destruction and therefore the
right place for the correction:

> **Empty this map?**
>
> This clears everything on "Ardenmoor Coast" and sets the canvas to portrait. The map keeps its
> name and its place in Your maps, and you can undo it in one step.
>
> To start a fresh map and keep this one, cancel and choose New map in Your maps.
>
> `[ Cancel ]  [ Empty the map ]`

Title and confirm label are unchanged from
[MapPanel.tsx:286-297](../../src/ui/MapPanel.tsx#L286-L297) — "Empty the map" already avoids the
word *reset*, which is the ambiguity ADR-35 split the old button to remove. **This matters
because `New map` is leaving:** without the signpost, a user who wants a fresh map reaches for
the only nearby thing that sounds close and empties their work instead. The confirm catches it
and undo covers it, but the dialog should name the other door rather than merely block the wrong
one.

## 5. WP-31 · The landing page

A static HTML file. No React, no router, no editor bundle — styled with the Tailwind build and
`tokens.css` the app already uses, so the page and the application cannot drift, and a visitor who
lands on `/` arrives at `/maps` with the stylesheet already cached.

**The job is one click to a canvas, not persuasion.** There is no login wall (ADR-07), so the
product sells itself in thirty seconds of painting a coastline; every element on this page is
either getting someone to `/maps` or telling a search engine what this is.

**Above the fold:** an exported map as the hero, a headline, one sub-line, **one** primary CTA
→ `/maps`. The hero is a **WebP exported from the editor itself** (**D11**) — zero bundle cost on
a static page, and it cannot promise something the renderer does not draw.

**Sections**, one sentence and one image each, every image exported from the app:

| # | Claim | Why it is on the page |
|---|---|---|
| 1 | Coastal rings, derived automatically | The signature look, and nobody else generates it from a hand-painted brush. Rings on lakes too, merging in a strait instead of colliding — ADR-13's two-for-one, and it is visible in a picture |
| 2 | Paint the land, don't place tiles | Area brush plus coast detail; land merges and splits by itself |
| 3 | Or generate a world — then edit it | Principle 2 as a *competitive* claim: generated content is ordinary editable geometry, which is what the generator-only and placement-only tools cannot say |
| 4 | Everything is an object | Move a continent and its mountains come with it. Undo everything |
| 5 | Export what you make | **Only what has shipped** — PNG/JPG/WebP |
| 6 | Free, and specifically how | ADR-31's boundary nearly verbatim: everything that runs in your browser is free, including every export format |

**Not on this page:** pricing (nothing to sell), a roadmap (invites judgement on absence), email
capture (nothing to send), testimonials (none exist).

**`/how-it-works` is reserved, shell only.** The content — the strait fix, the 2 493 ms → 119 ms
offsetter swap (ADR-26), the measured ink percentages (ADR-30), the seeded-screenshot lesson
(`07` §1) — is written when the rest is done, and is intended to be liftable into the author's
main site.

### 5.1 Sign in, and how a static page knows

**There are no `/login` or `/signup` pages** (**D9**). ADR-06 picks OIDC Auth Code + PKCE, so the
SPA redirects to **Zitadel's hosted login page**; there is no form to build, and registration,
Google/GitHub, password reset, verification and MFA all live there. Building our own would split
the sign-in surface across two systems, which is what a shared IdP (ADR-34) exists to prevent.

What P2 needs instead: a **Sign in button** that fires the redirect, a **Sign up** variant that is
the same redirect with a signup hint parameter — **whose exact name is verified against a live
Zitadel at P2 WP-1**, not assumed — and `/auth/callback`, which lands on `/maps`.

**How the static page knows.** `platform/README.md` D2 keeps **no refresh token in the browser**:
the access token is held in memory and renewed with `prompt=none`. A fresh page load therefore has
nothing to read, and the landing page has no server render to ask.

**Decision (D10): a localStorage hint.** A non-sensitive "has signed in before" flag, written
after a successful login, so the header can read **Go to your maps** instead of **Sign in**. No
network call, works on a static file, and a stale flag degrades to showing "Sign in" — which is
merely the wrong label, not a broken page. **It is a hint and never an authorization decision**;
ADR-31 already settles that the server's 402 is the authority, and 401 is the same.

Rejected: a silent `prompt=none` check on load (authoritative, but a round-trip to the IdP on
every marketing page view plus browser cookie-policy fragility, for a cosmetic label).

**Ship the slot now, the buttons at P2.** There is no auth until then, and a Sign in button that
does nothing is worse than none. Keep it quiet either way: ADR-07's "no login wall" is a promise
about how the product *feels*, and a prominent Sign in reads as a wall even when nothing is
walled.

### 5.2 The logged-in flow, for the record

```
/  →  Sign in  →  Zitadel hosted login  →  /auth/callback  →  /maps
                                                               ├─ merged local + cloud, sync badges (ADR-33)
                                                               ├─ claim offer, if unclaimed local drafts exist
                                                               └─ empty only if BOTH sources empty AND both known
```

`/maps` is where ADR-33's **claim offer** belongs — offered, never automatic, because an automatic
bulk claim would make logging in the most punitive moment in the product.

## 6. Decisions — all twelve settled

- **D1 — one origin, static landing plus SPA. → Yes.** `map.byfauzi.com` serves both. Keeps
  ADR-34's same-origin `/api/*`; a separate app subdomain costs a certificate and a CORS policy
  and moves no bytes.
- **D2 — react-router? → No, hand-rolled.** Four routes, one parameter, no nesting. Revisit at P2
  nested/guarded routes, or on a measurement.
- **D3 — does `/maps` replace the dialog or sit beside it? → Replace.** Two renderings of one list
  is the two-Generate-buttons story from ADR-36 repeating itself. And a page is the *more honest*
  presentation, because ADR-35 already makes switching maps a hard boundary.
- **D4 — do `New map` and `Open Map…` leave the menu bar? → Yes, both.** §2's rule. The brand mark
  covers the way back, and the reset dialog signposts New map (§4.9) so the removal cannot cost
  someone their work.
- **D5 — is `/maps/create` a page or a redirect? → A page.** Canvas size is free only at creation
  (§1), which needs a screen. It also stops a landing-page bounce from writing an empty draft.
- **D6 — canvas default? → Landscape on the create page; the current preset in the `Map` menu.**
  The menu half is ADR-36's existing radio behaviour, unchanged.
- **D7 — where does generation run? → In the editor, after the navigation.** Reuses the existing
  path and toast; the user sees the app sooner; no second loading state for 250–420 ms.
- **D8 — two tabs on one map? → Detect and warn** (§4.8).
- **D9 — `/login` and `/signup` pages? → Neither.** Zitadel hosts the flow (§5.1).
- **D10 — how does a static page show login state? → A localStorage hint**, never an authorization
  decision (§5.1).
- **D11 — hero: live viewer or an image? → An exported image.** A live viewer is P3's
  `@byfauzi/map-viewer` arriving early — the better demo, and a work package of its own with a
  bundle cost on a page whose whole advantage is having none. Revisit when P3 exists.
- **D12 — a `/maps/create?w=<code>` query parameter? → No.** With a real page the code is a field.
  A parameter would only serve a shareable "make this exact world" link, which nobody has asked
  for, and it carries a trap: a `?w=` surviving the URL adoption would re-run the generator on
  every reload and destroy the user's work.

## 7. What this costs

**WP-30**

| File | Change |
|---|---|
| `src/routes.ts` | **new**, ~30 lines — match, navigate, `popstate`, title |
| `src/ui/Link.tsx` | **new**, ~15 lines — anchor plus modified-click passthrough |
| `src/ui/MapsPage.tsx` | **new** — `MapGallery` in a page shell, empty state, redirect |
| `src/ui/CreatePage.tsx` | **new** — canvas picker plus WP-23's generate form |
| `src/ui/MapGallery.tsx` | dialog shell removed; the list stays |
| `src/ui/MapPanel.tsx` | `New map` / `My maps` / preset chips leave; reset copy updated |
| `src/persistence/drafts.ts` | `rememberOpen` / `rememberedOpen` **deleted** |
| `src/persistence/useAutosave.ts` | restore reads the route; `flush` exported for navigation |
| `src/App.tsx` | renders a route rather than the editor |
| `vite.config.ts` | multi-entry input; `appType: "mpa"` plus the dev/preview middleware |
| `Caddyfile` | static at `/`, SPA fallback under `/maps`, **`/s/*` and `/embed/*` first** |

**WP-31** — **built at the repo root**, not in `landing/`: `index.html`, `how-it-works.html`
(shell), `404.html`, the exported images under `public/landing/`, and the shared stylesheet. One
file per URL, so the mapping is the identity rather than a rewrite. Measured: all four HTML files
link the same `assets/src-*.css` and only `app.html` carries a script.

**No new dependency in either.** The router is thirty lines, `BroadcastChannel` is a platform
API, and the landing page is HTML.

**Build order: WP-30, then WP-31.** WP-30 serves `/` as a one-line Caddy redirect to `/maps` so
nothing is half-built while WP-31 is pending.

## 8. Acceptance

**WP-30** — driven input throughout, since every item here is a click or a navigation.

- Every route renders its own screen, and **Back and Forward move between them** — driven, asserting
  the store or the DOM changed, not a screenshot.
- **Back out of `/maps/create` without choosing**, and Back returns the previous map **with its
  undo stack** — the singleton-store check in §4.4, proved by actually undoing after the return.
- **Complete `/maps/create` instead**, and Back reaches that same previous map — *not* the setup
  page — this time with an **empty** undo stack, because the store now holds a different `meta.id`
  and ADR-35 clears history on a switch. The two halves pull opposite ways, which is what makes
  the pair discriminating: one asserts history survives, the other that it is dropped.
- **A mutation proving the flush discriminates:** remove the flush from the navigation path, and a
  check that edits, navigates within 800 ms and reads the *record* must fail. `07` §1's rule — a
  check that cannot fail is not a check.
- Creating a map on `/maps/create` writes **no draft until the user clicks through**, and exactly
  one after — read the IndexedDB record, not the UI (WP-22's lesson).
- `/maps` with no drafts redirects to `/maps/create`, and **Back from there reaches the landing
  page rather than bouncing** — the trap-2 check.
- Right-click → *Open in new tab* on `New map` opens a second tab, and the first tab's map is
  unchanged.
- Two tabs on the same `/maps/edit/{uuid}` raise the warning banner in the second; two tabs on
  *different* maps do not.
- An unknown uuid redirects to `/maps` with a toast **and creates no record with that id**.
- A reload at `/maps/edit/{uuid}` restores that map — with `rememberOpen` deleted, so the URL is
  demonstrably what did it. Age another draft so "newest" and "this one" differ, or the check
  cannot fail (WP-22's lesson, again).
- **`vite preview` routes identically to `npm run dev`** — the two-places-one-rule check from §4.1.
- The `Map` menu offers no `New map` and no `Open Map…`; the reset dialog carries the New map
  signpost.

**WP-31**

- `/` responds with the headline and every section heading **in the HTML body**, not after
  JavaScript — the whole point of a static page; assert on the response text.
- The landing page loads **no editor bundle** — assert on the network requests, not on feel.
- The CTA reaches `/maps` and the theme matches the app's in both light and dark, because both read
  the same tokens.
- `/how-it-works` and the 404 both render and both link home.

## 9. Rejected

- **`/` as the editor, no landing page at all.** Tempting given there is no login wall — but ADR-04
  asks for indexable prose, and P2's share links need somewhere to send "what is this?" traffic.
  The compromise is the CTA, not the absence of the page.
- **react-router.** Two routes today and four at P2, none nested. Revisit on a measurement.
- **Prerendering the landing page out of the SPA** (`vite-react-ssg` or similar). A dependency and
  a build step to produce a file we can simply write, and it would put the editor's shell — and
  eventually its bundle — behind a marketing page.
- **Keeping the gallery dialog alongside the page** (D3).
- **`/maps/create` as a mint-and-redirect** (D5). It writes an empty draft for every bounce, and it
  has nowhere to offer the one canvas-size choice that is free.
- **A separate app subdomain.** Costs a certificate and same-origin `/api/*`; moves no bytes.
- **`/login` and `/signup` pages** (D9), and a silent `prompt=none` check to drive the header
  (§5.1).
- **A live map viewer in the hero** (D11) — revisit when P3's `@byfauzi/map-viewer` exists, at
  which point it is a mount rather than a package.
- **`/edit` kept as a redirect.** Nothing is deployed; two spellings of one route from day one is
  how an address space rots.
