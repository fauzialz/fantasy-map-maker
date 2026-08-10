# Phase 2 — Accounts, Cloud Persistence & Hosted Sharing · Agent Work Order

> **You are an AI coding agent.** Add the backend: login (Zitadel), a Go + Postgres
> API for saving maps to the cloud, a "my maps" gallery, claiming anonymous local
> drafts on login, hosted share pages + live iframe embeds, and SVG/PDF export.
> **The login must never become a wall** — the anonymous editor keeps working exactly
> as in Phase 0.

## Required reading
- `../01-system-design.md` §5, §11, §12 (architecture, export, auth/backend/persistence).
- `../02-scene-data-model.md` — scene contract; note `meta.id` (client UUID) and
  `migrate()`.
- `../03-architecture-decisions.md` — ADR-06 (Zitadel), ADR-07 (no wall / local-first),
  ADR-08 (phase order), ADR-04 (SEO/SSR share pages), **ADR-34 (topology: Zitadel is shared
  infrastructure, this repo is the map product)**, and **ADR-31 (what is free vs
  gated, and how the cap is enforced) + ADR-33 (opt-in cloud sync, claim, conflicts,
  deletion)** — the last two govern most of WP-2 … WP-4.
- `../../platform/README.md` and `../../platform/01-zitadel-setup.md` — **mandatory before
  WP-1 and WP-2.** Zitadel, Postgres and nginx are shared across apps and are not built in
  this repo; the setup, app registration, `users` shape and integration contract are
  specified there.

## Definition of done for Phase 2
A user can log in with Google/GitHub/email, save maps to the cloud and reopen them from
a "my maps" gallery, have their pre-login local drafts **claimed** into their account,
publish a **public share link** with correct social-preview meta, embed a **live
iframe**, and export **SVG/PDF**. Anonymous use is unchanged.

## Hard constraints
- **Backend:** **Go** (chi or echo), `pgx` + `sqlc`, **Postgres** (scenes as `jsonb`).
- **Auth:** **Zitadel** self-hosted; SPA uses **OIDC Authorization Code + PKCE** (no
  client secret in the browser); Go validates JWTs via **JWKS** (no server sessions).
- **Zitadel, Postgres and nginx are not built here.** They are shared infrastructure
  operated from `fauzialz/infra` (ADR-34). This repo builds the SPA auth client and the map
  API; it never adds an IdP service of its own.
- **Identity has one source of truth, and it is Zitadel.** The local `users` row is a
  foreign-key anchor, a lock target for the cap check, and a **cache** of profile claims —
  never authoritative. See `../../platform/01-zitadel-setup.md` §6.
- **Keep `auth/` free of map-specific imports.** Issuer and audience in, `sub` out. It is
  the package that lifts into a shared service later; a single map import is what turns that
  move into a rewrite.
- **No login wall.** Gate only cloud features behind auth; the editor, local autosave,
  image export, and P1 exports all work logged-out.
- **SaaS seam:** include a **nullable `tenant_id`** on `maps` now (a filter later, not a
  migration scramble).
- Every scene read (cloud or local) runs through **`migrate()`**.

## Work packages

### WP-1 · Zitadel setup + OIDC/PKCE in the SPA

> **Half of this package does not belong to this repository.** Zitadel is **shared
> infrastructure** across every byfauzi app, not this app's service — see **ADR-34**. Standing
> it up is `fauzialz/infra`'s work, and the compose file, nginx sites, app registrations and
> integration contract are already written, paste-ready, in
> **`../../platform/01-zitadel-setup.md`**. Do not re-derive them here, and do not add a
> Zitadel service to this repo. What stays in this package is the **SPA auth client**.

- **Infra side (in `fauzialz/infra`, per `../../platform/01-zitadel-setup.md`):** stand up
  Zitadel + Postgres behind nginx; configure upstream logins **Google, GitHub,
  email/password**; register `map-spa` (User Agent, PKCE, **JWT** access tokens) and
  `map-api` under the **Map** project. Mind the four settings in that document's §3 — each
  fails with a symptom that does not name its cause.
- **SPA side (here):** PKCE login/redirect and callback; **access token in memory only**,
  never `localStorage`; renewal by **`prompt=none`** — top-level redirect on load, hidden
  iframe mid-session — and **no refresh token in the browser** (platform D2). Handle
  `error=login_required` by rendering the logged-out state, not by redirecting again.
  Sign-out via `end_session_endpoint` (platform D3).
- **Never block boot on auth.** ADR-07: the editor renders anonymous and fully usable first;
  the silent check runs in the background and only swaps in signed-in chrome if it succeeds.
- **Acceptance:** a user logs in with each provider and receives a valid JWT; a session
  outlasts several access-token lifetimes without a visible re-login and **without a
  refresh token existing in browser storage**; `login_required` renders logged-out rather
  than looping; sign-out ends the Zitadel session, so a reload does not silently sign the
  user back in; logged-out users see no functional regression.

### WP-2 · Go API service
- Endpoints (per §12):
  ```
  GET /api/maps · POST /api/maps · GET /api/maps/{id} · PUT /api/maps/{id} ·
  DELETE /api/maps/{id} · POST /api/maps/{id}/thumbnail · POST /api/maps/{id}/share
  ```
- **JWT validation via Zitadel JWKS** middleware; `sub` claim → user id. Authz: a user
  may only touch their own maps.
- **Postgres schema** (per §12): `users`, `maps` (with nullable `tenant_id`), `shares`.
  Use `sqlc`. `maps` also carries **`cloud_sync bool not null default true`**,
  **`deleted_at`** and **`downgraded_at`** (ADR-33) — the last two nullable and distinct,
  so "the user deleted this" and "billing lapsed" stay tellable apart.
- **PUT** uses an **optimistic version check** (`updated_at`) → 409 on stale write
  (two-tab clobber protection).
- **Cap enforcement (ADR-31).** `POST` rejects with **402** when the account is at its map
  cap (free 5, paid 100). The check must be **atomic**: `SELECT count(*)` followed by
  `INSERT` is a TOCTOU race — under read-committed two concurrent requests both see 4 and
  both insert. Take a per-user row lock (`SELECT … FROM users WHERE id = $1 FOR UPDATE`) at
  the top of the transaction. The lock covers **every insertion path** — create, single
  claim, bulk claim, restore-from-trash — and the count **excludes soft-deleted rows**
  (`deleted_at IS NULL`), or delete-to-make-room fails to free a slot.
- **`GET /api/maps` returns `isShared`** (and the slug) per map, so the at-cap dialog can
  warn about live embeds without N extra round-trips. Advisory — `DELETE`/`PUT` report in
  their response what actually happened to the slug.
- **Soft delete:** `DELETE` sets `deleted_at`; a purge job removes rows past 30 days
  (60 for `downgraded_at`) and their S3/R2 thumbnails. Add a **restore** path — it is an
  insertion path, so it takes the lock and the cap check like any other.
- **Request body limit** (`http.MaxBytesReader`, ~10 MB) on scene writes. Not a tier
  feature — admission control, since the tripwire cannot measure a body it has not parsed.
- **Acceptance:** full CRUD works with auth; cross-user access is denied; a stale PUT is
  rejected with a clear conflict signal; **two concurrent POSTs on an account with one slot
  left produce one 201 and one 402, never two rows**; a soft-deleted map stops counting
  toward the cap and its share slug stops resolving.

### WP-3 · Cloud persistence + sync UI
- Wire the editor to save/load scenes to/from the API. **Cloud sync is opt-in per map
  (ADR-33):** a map becomes a cloud row only on an explicit user action — save menu,
  status-bar CTA, or the sync toggle. **The cap is checked once, at first materialisation,
  never on an autosave tick.** Once materialised, sync is debounced. Local IndexedDB
  autosave stays hardcoded on throughout and is never disableable.
- **Three UI elements, distinct jobs.** A persistent status indicator (cloud state
  headlines when sync is on, local state when off) — note `App.tsx` already renders
  `SAVE_LABEL`, and this replaces rather than duplicates it. A **closeable** CTA banner
  ("this map is only on this device"), the *only* closeable element, scoped per map and
  re-shown once per new session while the map stays unsynced. Toasts (`toastStore` exists)
  for failure, conflict and cap events — closing the banner must never hide these.
- **Conflict model.** `DraftRecord` gains `lastSyncedLocalAt` + `lastSyncedServerAt`;
  compare each side against its own clock, never local against server (different clocks).
  **Genuine conflict = both sides changed since the last common sync point** — the other
  three combinations resolve without a prompt. Never auto-resolve; keep both copies until
  the user picks. Toggling sync on goes through the version check and, on 409, leaves sync
  **off** and raises the prompt.
- **Extend the `past.length > 0` guard to the cloud path.** `useAutosave` already refuses
  to restore over work in progress; the network is slower than IndexedDB so the risk is
  higher, but the cloud case must **route into the conflict flow rather than discarding** —
  "already edited" means conflict, not a reason to drop the remote copy.
- Generate and store a **PNG thumbnail** per map. LRU-prune local drafts to ~20, evicting
  **only fully synced** maps — never one that is local-only or ahead of cloud.
- **Two decisions left open deliberately, to settle while building** (they need the real
  thing in front of you, not a guess in a design doc):
  - **Sync cadence and the offline queue.** The local layer throttles at 800 ms with
    documented reasoning (`useAutosave`); the cloud layer wants something much longer,
    because the cost is a network round-trip rather than an IDB write. Decide the interval,
    whether a failed sync queues and retries or simply waits for the next change, and how
    many times before it stops and says so. **Never silently drop a sync** — a failure the
    user cannot see is worse than one that stops trying.
  - **Thumbnail timing.** First cloud save only, every sync, or throttled independently.
    Rendering a thumbnail is not free, and the gallery is the only consumer.
- **Acceptance:** a new map stays local until explicitly synced and **never fires a cloud
  write on an autosave tick**; a map edited on two devices raises a conflict prompt and
  loses neither copy; painting immediately on load is never overwritten by an arriving
  cloud scene.

### WP-4 · Offer to claim local drafts (never automatic)
- **Login claims nothing by itself (ADR-33).** When unclaimed local drafts exist, *offer*
  a claim: "save all N" when N fits the remaining slots, or a **selection list capped at
  the remaining count** when it does not. Remaining count comes from the server, never a
  client guess.
- Dismissible and lossless (maps stay local), **idempotent on `meta.id`**, re-openable
  later from the gallery or save menu, and suppressible with a "don't ask again"
  preference that stays **re-enableable in settings**.
- Bulk claim is N inserts, so **partial failure is normal** — report per-map results and
  never roll back the successes.
- **Acceptance:** logging in with 12 local drafts and a cap of 5 destroys nothing, claims
  nothing silently, and lets the user pick exactly 5; repeating the login does not
  duplicate a claimed map.

### WP-5 · Hosted share page (SSR meta) + live iframe

> **Scope boundary — settled.** Sharing is **one public read-only link per map**, and nothing
> else. No per-person access grants, no invite flow, no shared editing. Those are deferred
> (`../01-system-design.md` §15) and they are the point at which per-object permissions would
> become real — rows in the `maps` domain, never Zitadel roles (ADR-34). Do not add a members
> table here.
>
> **Make the slug a random token, not sequential**, so an unlisted map is not discoverable by
> counting.
- `GET /s/{slug}` — the **Go backend serves an HTML shell with escaped `<meta>`/Open
  Graph tags** (title, description, thumbnail) so social unfurls and search see real
  content; the SPA viewer hydrates on top.
- `GET /embed/{slug}` — a minimal **viewer-only** page for iframes (reuses the P1
  read-only viewer). Provide a copy-paste `<iframe>` snippet.
- `POST /api/maps/{id}/share` — create/rotate a public slug; respect a per-map
  public/private flag.
- **Slug lifecycle (ADR-33):** a **soft-deleted** map's slug stops resolving immediately —
  a map in the trash must not stay publicly readable for 30 days — and resolves again on
  restore. Purge destroys it. An **over-limit** (`downgraded_at`) map's slug is disabled
  too: hosted sharing is the paid surface.
- **Acceptance:** a shared link unfurls correctly on social platforms; the live iframe
  renders the current map; making a map private disables its slug; deleting a map stops
  its slug resolving at once, and restoring it brings the same slug back.
- **Security:** **escape all user text injected into HTML meta** (OG/HTML injection).

### WP-6 · SVG & PDF export
> **Free and anonymous, despite shipping in this phase.** Both are generated entirely
> client-side from the scene graph — no API call — so by ADR-31 they are free-tier, and
> gating them behind login would put a wall in front of exporting (ADR-07). This package
> ships in P2 because that is when it is *built*, not because it is an account feature.
- **SVG:** re-emit the scene graph as SVG (the vector model makes this clean — coast
  polygons, derived rings as stroked offset paths, sprites as embedded SVG/symbols).
- **PDF:** SVG → PDF for print-friendly large maps.
- **Acceptance:** SVG opens crisp and scalable in a vector editor; PDF prints at size;
  both match the on-canvas look.

## Gotchas
- **Token refresh:** long edit sessions must refresh silently — never 401 a save.
- **Meta escaping:** the SSR share page is an injection surface; escape everything.
- **Claim idempotency:** key on `meta.id`; never duplicate on repeated logins.
- **Optimistic concurrency:** two tabs → last-write must not silently clobber (409 +
  reconcile).
- **`tenant_id` now:** add the nullable column even though it's unused, so SaaS
  multi-tenancy is a filter, not a migration.

## Out of scope for Phase 2
The published npm React packages (P3), the second (modern) map style, and **billing** —
checkout, tiers, entitlement storage, the upgrade/downgrade flow. Note the split
(ADR-31): billing is out, but the **cap enforcement seam is in** — WP-2's atomic count
check and 402 are Phase 2 work. The downgrade policy in ADR-33 is recorded intent only;
there is no upgrade path yet to downgrade from.
