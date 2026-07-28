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
  ADR-08 (phase order), ADR-04 (SEO/SSR share pages).

## Definition of done for Phase 2
A user can log in with Google/GitHub/email, save maps to the cloud and reopen them from
a "my maps" gallery, have their pre-login local drafts **claimed** into their account,
publish a **public share link** with correct social-preview meta, embed a **live
iframe**, and export **SVG/PDF**. Anonymous use is unchanged.

## Hard constraints
- **Backend:** **Go** (chi or echo), `pgx` + `sqlc`, **Postgres** (scenes as `jsonb`).
- **Auth:** **Zitadel** self-hosted; SPA uses **OIDC Authorization Code + PKCE** (no
  client secret in the browser); Go validates JWTs via **JWKS** (no server sessions).
- **No login wall.** Gate only cloud features behind auth; the editor, local autosave,
  image export, and P1 exports all work logged-out.
- **SaaS seam:** include a **nullable `tenant_id`** on `maps` now (a filter later, not a
  migration scramble).
- Every scene read (cloud or local) runs through **`migrate()`**.

## Work packages

### WP-1 · Zitadel setup + OIDC/PKCE in the SPA
- Stand up **Zitadel** (Docker Compose alongside Postgres). Configure upstream logins:
  **Google, GitHub, email/password**. Register the SPA as an OIDC client.
- Implement the SPA auth client: PKCE login/redirect, token storage, **silent refresh**
  so long editing sessions don't 401 mid-save, logout.
- **Acceptance:** a user logs in with each provider and receives a valid JWT; refresh
  keeps a long session alive; logged-out users see no functional regression.

### WP-2 · Go API service
- Endpoints (per §12):
  ```
  GET /api/maps · POST /api/maps · GET /api/maps/{id} · PUT /api/maps/{id} ·
  DELETE /api/maps/{id} · POST /api/maps/{id}/thumbnail · POST /api/maps/{id}/share
  ```
- **JWT validation via Zitadel JWKS** middleware; `sub` claim → user id. Authz: a user
  may only touch their own maps.
- **Postgres schema** (per §12): `users`, `maps` (with nullable `tenant_id`), `shares`.
  Use `sqlc`.
- **PUT** uses an **optimistic version check** (`updated_at`) → 409 on stale write
  (two-tab clobber protection).
- **Acceptance:** full CRUD works with auth; cross-user access is denied; a stale PUT is
  rejected with a clear conflict signal.

### WP-3 · Cloud persistence + "my maps" gallery
- Wire the editor to save/load scenes to/from the API; **debounced cloud autosave** for
  logged-in users (local IndexedDB remains the offline/anonymous layer).
- Generate and store a **PNG thumbnail** per map. Build a "my maps" gallery
  (thumb/title/updatedAt; open/rename/delete).
- **Acceptance:** logged-in edits persist to the cloud and reopen across devices;
  thumbnails render in the gallery; autosave is debounced (not per-keystroke).

### WP-4 · Claim anonymous local drafts on login
- On first login, detect IndexedDB drafts and **claim** them into the account **by
  `meta.id`** (idempotent — logging in mid-session must not duplicate). Offer a simple
  merge/keep UI if a cloud map with the same id already exists.
- **Acceptance:** a map made logged-out appears in the gallery after login exactly once,
  even if the user was mid-edit when they logged in.

### WP-5 · Hosted share page (SSR meta) + live iframe
- `GET /s/{slug}` — the **Go backend serves an HTML shell with escaped `<meta>`/Open
  Graph tags** (title, description, thumbnail) so social unfurls and search see real
  content; the SPA viewer hydrates on top.
- `GET /embed/{slug}` — a minimal **viewer-only** page for iframes (reuses the P1
  read-only viewer). Provide a copy-paste `<iframe>` snippet.
- `POST /api/maps/{id}/share` — create/rotate a public slug; respect a per-map
  public/private flag.
- **Acceptance:** a shared link unfurls correctly on social platforms; the live iframe
  renders the current map; making a map private disables its slug.
- **Security:** **escape all user text injected into HTML meta** (OG/HTML injection).

### WP-6 · SVG & PDF export
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
The published npm React packages (P3), billing/multi-tenant activation, the second
(modern) map style.
