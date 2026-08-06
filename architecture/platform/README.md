# Platform — shared infrastructure across byfauzi apps

> **⚠️ This folder does not belong to this repository long-term.**
>
> Everything in `architecture/platform/` describes infrastructure shared by **several
> applications**, of which this map editor is only the first. It lives here because it has
> nowhere better to live yet, and because writing it down late is how it gets rebuilt wrong.
>
> **Destination: a `byfauzi-infra` repository.** When that repo exists, this folder moves
> whole — `git mv architecture/platform <infra-repo>/docs`. Nothing in it imports from
> `../v1/`, and nothing in `../v1/` imports from it, so the move is one command with no
> edits. Keep it that way.

Sits outside `v1/` deliberately, as a **sibling** rather than a child: `v1/` is the map
product's design at version 1, and platform infrastructure has its own lifecycle. A future
map design v2 must not strand these documents in a v1 folder.

---

## What is shared, and what is not

One thing is shared between every byfauzi app: **identity**. Nothing else.

| | Shared | Owner |
|---|---|---|
| Sign-in, user profile, sessions | ✅ | Zitadel |
| TLS, routing, DNS | ✅ | Caddy, this folder |
| Postgres *server* | ✅ | one container, one per-app database |
| Application data | ❌ | each app, its own database and role |
| Billing / entitlements | ❌ | each app — **billing is separate per app** |
| Roles / permissions | ❌ | no roles exist; see "authorization" below |

**The data boundary is `user_id` and nothing else.** No query joins one app's tables to
another's. This is enforced by giving each app its own database and its own Postgres role,
so it is a permission the server refuses rather than a rule someone remembers.

## Topology — current (Option 5)

Three repositories, separate backends, shared IdP.

```
                            Internet
                               │
                      ┌────────▼────────┐
                      │  Caddy  (TLS)   │        byfauzi-infra
                      └──┬──────┬─────┬─┘
          ┌──────────────┘      │     └──────────────┐
          │                     │                    │
  auth.byfauzi.com      map.byfauzi.com      write.byfauzi.com
          │                     │                    │
     ┌────▼─────┐      ┌────────┴────────┐  ┌────────┴────────┐
     │ Zitadel  │      │ /      → dist/  │  │ /      → SSR    │
     │  (OIDC)  │      │ /api/* → Go     │  │ /api/* → Go     │
     └────┬─────┘      └────────┬────────┘  └────────┬────────┘
          │                     │                    │
          │               ┌─────▼─────┐        ┌─────▼─────┐
          │               │  map-api  │        │ write-api │
          │               │   (Go)    │        │   (Go)    │
          │               └─────┬─────┘        └─────┬─────┘
          │                     │                    │
     ┌────▼─────────────────────▼────────────────────▼─────┐
     │                      Postgres                        │
     │   db: zitadel    │  db: mapapp     │  db: writeapp   │
     │   (hands off)    │  users, maps,   │  users,         │
     │                  │  shares         │  chapters, …    │
     └──────────────────────────────────────────────────────┘
```

| Repo | Contains | Licence |
|---|---|---|
| `fantasy-map-maker` | map SPA, map Go API, `architecture/` | MIT, public (ADR-32) |
| `writing-app` | write frontend + Go API, its own docs | TBD |
| `byfauzi-infra` | compose, Caddyfile, Zitadel config, **this folder** | private |

**Today only the static frontend is deployed.** P0 ships frontend-only — no Zitadel, no
Postgres, no API. Caddy serves `dist/` from the VPS and nothing else. The rest of this
diagram arrives with P2. Serving from the VPS now rather than a static host is deliberate:
it keeps the API **same-origin** when it arrives, so `/api/*` is a Caddy route rather than a
migration and a CORS policy.

## Authorization — there are no roles

The only authorization rule is **ownership**: `maps.owner_id = sub`. Plus a **count**
(ADR-31's map cap), which is a column checked inside the insert transaction.

Free-versus-paid is deliberately **not** a role and **not** a token claim. A claim is a
snapshot from whenever the token was minted, so an upgrade wouldn't take effect until the
token rolled over and a downgrade would keep the higher cap for the same window. ADR-31 is
explicit that the 402 is the authority and the client has no vote.

Zitadel project roles are the right home for coarse, slow-changing, identity-adjacent facts
— `admin`, `staff` — if an admin surface ever exists. It has none today, so none are
defined. Per-object permissions (a future "share this map with Alice") are rows in the
owning app, not IdP roles.

## Identity is Zitadel's, and only Zitadel's

Each app keeps a local `users` row, but it is **not** a second source of truth. It exists
for three reasons and no others:

1. a foreign key anchor for that app's tables,
2. a row to lock for ADR-31's `SELECT … FOR UPDATE` cap check,
3. app-specific preferences that belong to neither the IdP nor the other app.

`email` and `display_name` are a **cache** of Zitadel claims — refreshed from the token,
never written by the app, safe to truncate and rebuild. See `01-zitadel-setup.md` §6.

## Decisions

| | Decision | Outcome |
|---|---|---|
| **D1** | Access token format | **JWT**, validated via JWKS. Opaque tokens would mean an introspection round-trip per request and a live dependency on Zitadel for every API call. |
| **D2** | Session renewal | **Access token in memory, renewed by `prompt=none`.** No refresh token in the browser. All apps are subdomains of one registrable domain, so the IdP session cookie is same-site and the silent path is reliable. Refresh tokens with rotation only if an app ever moves off `byfauzi.com`. |
| **D3** | Logout | **"Sign out" = RP-initiated** (`end_session_endpoint`) — ends the Zitadel session in *this browser*, which signs the user out of every byfauzi app on that machine. **"Sign out of all devices"** is a separate action. Local-only logout was rejected: the app clears its tokens, the next `prompt=none` finds the session alive and signs the user straight back in. |
| **D4** | Where P0 deploys | **The VPS, frontend only.** Caddy serves static `dist/`; no backend containers until P2. |
| **D5** | Account deletion propagation | **A reconcile cron, one per app.** Each app walks its own `users` against Zitadel's Management API; a missing `sub` means purge. A webhook can be missed while an app is down and never noticed; a cron cannot silently fail. Consolidates to one job under Option 3. |

Profile **edits** need no cron — they self-heal from token claims on the user's next
session (§6 of the setup doc).

## Migrating to Option 3 (one shared backend)

Not scheduled. Move when app three or four exists, or when a cross-cutting change has
touched more than two repos in a week.

**Preconditions to preserve now — free, and they are what make this a move rather than a
rewrite:**

- `auth/` is its own Go package with **zero** app-specific imports: give it an issuer and an
  audience, get back a `sub`.
- `users` carries no app-specific columns; preferences live in a separate table.
- Migrations are per-schema and independently runnable.
- No query crosses the app boundary (already enforced by separate databases).

**Phases**, in order, with the point of no return marked:

| | Phase | Reversible |
|---|---|---|
| 1 | Extract `auth/`, `users/`, the Zitadel client into their own module, in place. No deploy change. | fully — it is a refactor |
| 2 | Stand up `byfauzi-platform`: one binary, `internal/maps/` and `internal/writing/`, shared `users` schema, per-app schemas keep their own migrations. Deploy it serving nothing. | fully — nothing routes to it |
| 3 | Repoint Caddy `map.byfauzi.com/api/*` at it. Watch. Then `write`. | **trivially** — one Caddy config |
| 4 | Merge the two `users` projections into one row per human, joined on `zitadel_sub`. | ❌ **point of no return** |
| 5 | Scope-based authorization per route. | additive |

Phase 5 is the one that is easy to skip and must not be. Today a token minted for the
writing SPA is rejected by the map API on `aud` alone. With one API application that
boundary disappears and **scopes** carry it instead — which only works if the middleware
asks. Write the scope checks in phase 2, while `aud` is still covering for you.

**What gets harder:** cross-cutting changes span two repos with no atomic commit; the `aud`
safety net is gone; a bad deploy takes down paid reading and cloud sync together. Anonymous
map editing still needs nothing, which is ADR-07 paying off.

### How the documentation splits

Product policy stays with the product; mechanism moves to the platform.

| Document | Lands |
|---|---|
| `v1/01`–`v1/10`, all editor design | **stays** — pure map product, ~90% of the folder |
| ADR-31 (free vs gated, the cap), ADR-33 (opt-in sync, conflicts) | **stays** — decisions about the map *product*; the platform merely implements them |
| `architecture/platform/` (this folder) | **moves whole** |
| P2 WP-1 (Zitadel setup) | already lives here — moves with this folder |
| P2 WP-2 (Go API, schema, cap enforcement) | mostly moves; the cap *policy* stays as ADR-31 |
| P2 WP-3, WP-4 (sync UI, claim offer) | **splits** at the client/server line — UI and the `past.length > 0` guard stay, endpoints move |
| P2 WP-5 (share page, iframe) | moves |
| P2 WP-6 (SVG/PDF export) | **stays entirely** — client-side, free, anonymous (ADR-31) |

Files that split are left in place and marked inline. Pre-splitting them for a migration
that may never happen is work spent on a maybe.

## Contents

- `01-zitadel-setup.md` — paste-ready Zitadel + Postgres + Caddy setup, the app
  registrations, and the gotchas that produce confusing login failures.
