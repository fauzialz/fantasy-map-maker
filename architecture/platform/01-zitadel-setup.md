# Zitadel — setup, registration and integration

> **⚠️ This document belongs in `byfauzi-infra`, not in this repository.** It is written
> paste-ready so that when the infra repo exists, the compose file, the Caddyfile and the
> registration steps can be lifted out unchanged. Nothing here is map-specific.
>
> **Nothing in this document is built yet.** P0 ships frontend-only; the whole stack below
> arrives with **P2 WP-1** (`../v1/prompts/phase-2-accounts-persistence.md`).

Decided in **ADR-06** (Zitadel as the IdP) and **ADR-34** (topology). D1–D5 are in
`README.md`.

---

## 1. What runs

Two containers behind Caddy, plus one Postgres shared by everything.

```
caddy      :443   TLS, routing, serves each app's static build
zitadel    :8080  OIDC — auth.byfauzi.com
postgres   :5432  three databases: zitadel · mapapp · writeapp
```

**Postgres is one container with three databases**, each with its own role. Not three
containers: one process to run, one volume to back up. Not one database with three schemas:
separate databases mean a role *cannot* reach across, so the cross-app data boundary is
enforced by the server rather than by discipline.

**Never read Zitadel's tables.** They are internal and change between versions. The contract
is the OIDC endpoints and the Management API — nothing else, even though it is one `\c` away.

## 2. `compose.yml`

> Verify env var names and the Postgres minimum against **the Zitadel version you pin** —
> they have moved across majors, and CockroachDB support was dropped, so Postgres is the
> only supported store.

```yaml
services:
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_ROOT_PASSWORD}
      POSTGRES_DB: postgres
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./initdb:/docker-entrypoint-initdb.d:ro   # creates mapapp, writeapp + roles
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 10

  zitadel:
    image: ghcr.io/zitadel/zitadel:latest        # pin a real version
    restart: unless-stopped
    command: >
      start-from-init --masterkeyFromEnv --tlsMode external
    environment:
      ZITADEL_MASTERKEY: ${ZITADEL_MASTERKEY}     # EXACTLY 32 bytes — see §3
      ZITADEL_EXTERNALDOMAIN: auth.byfauzi.com
      ZITADEL_EXTERNALPORT: 443
      ZITADEL_EXTERNALSECURE: "true"
      ZITADEL_DATABASE_POSTGRES_HOST: postgres
      ZITADEL_DATABASE_POSTGRES_PORT: 5432
      ZITADEL_DATABASE_POSTGRES_DATABASE: zitadel
      ZITADEL_DATABASE_POSTGRES_USER_USERNAME: zitadel
      ZITADEL_DATABASE_POSTGRES_USER_PASSWORD: ${ZITADEL_DB_PASSWORD}
      ZITADEL_DATABASE_POSTGRES_USER_SSL_MODE: disable
      ZITADEL_DATABASE_POSTGRES_ADMIN_USERNAME: postgres
      ZITADEL_DATABASE_POSTGRES_ADMIN_PASSWORD: ${POSTGRES_ROOT_PASSWORD}
      ZITADEL_DATABASE_POSTGRES_ADMIN_SSL_MODE: disable
      ZITADEL_FIRSTINSTANCE_ORG_HUMAN_USERNAME: ${ZITADEL_ADMIN_USER}
      ZITADEL_FIRSTINSTANCE_ORG_HUMAN_PASSWORD: ${ZITADEL_ADMIN_PASSWORD}
    depends_on:
      postgres:
        condition: service_healthy

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./sites:/srv:ro          # each app's built dist/
      - caddydata:/data
      - caddyconfig:/config

volumes: { pgdata: {}, caddydata: {}, caddyconfig: {} }
```

`--tlsMode external` is correct **because Caddy terminates TLS**. Zitadel speaks plain HTTP
inside the compose network and still believes it is reachable over HTTPS, which is what
`ZITADEL_EXTERNALSECURE: "true"` tells it.

## 3. Four settings that cause confusing failures

Each of these produces a symptom that does not name its cause.

| | Setting | If wrong |
|---|---|---|
| **1** | `ZITADEL_MASTERKEY` must be **exactly 32 bytes** | container refuses to start, with a message about key length that is easy to read as a config-file problem. Generate with `openssl rand -base64 32 \| head -c 32`. **Lose it and the instance is unrecoverable** — back it up before first boot. |
| **2** | `ZITADEL_EXTERNALDOMAIN` / `EXTERNALPORT` / `EXTERNALSECURE` must match how a **browser** reaches it | login *appears* to work, then the redirect goes to the wrong host, or issuer validation fails in your API. The discovery document is built from these values. |
| **3** | Caddy must forward the **original Host** header | as above, intermittently. Caddy's `reverse_proxy` does this by default; do not override it. |
| **4** | **iframe embedding policy** must allow your app origins | silent renewal (D2) fails with no visible error, and users get logged out when their access token expires. Set it in the instance security settings once the apps exist. |

## 4. Caddyfile

```caddy
auth.byfauzi.com {
    reverse_proxy zitadel:8080 {
        transport http { versions h2c 2 }     # Zitadel serves gRPC-Web over h2c
    }
}

map.byfauzi.com {
    encode zstd gzip
    root * /srv/map

    # P2: uncomment when the API exists — same origin, so no CORS, ever.
    # handle /api/* { reverse_proxy map-api:8081 }

    # P2's share and embed pages are server-rendered for their meta tags, so they must
    # match BEFORE the SPA fallback below or that fallback swallows them.
    # handle /s/* { reverse_proxy map-api:8081 }
    # handle /embed/* { reverse_proxy map-api:8081 }

    # The application. One HTML file for every route under /maps; the client router
    # reads the path. Mirrored by the dev-server middleware in `vite.config.ts` — the
    # two hold one rule in two places, and "works locally, 404s in production" has
    # exactly one signal, which is a deploy.
    handle /maps* {
        rewrite * /app.html
        file_server
    }

    # Until the landing page exists, / is a redirect rather than a half-built page.
    redir / /maps

    # Everything else is a static page: the landing page at /, /how-it-works, and an
    # HTML 404 for an unknown path, which never loads the application bundle.
    handle {
        try_files {path} {path}.html
        file_server
    }
    handle_errors {
        rewrite * /404.html
        file_server
    }
}
```

The commented block is the whole reason P0 deploys to the VPS rather than a static host:
when the API arrives it is **three lines here**, not a migration and not a CORS policy.

## 5. Registration — projects, apps, scopes

```
Instance: auth.byfauzi.com
└── Organization: byfauzi
    ├── Project: Map
    │   ├── App: map-spa    (User Agent · PKCE · no secret)
    │   └── App: map-api    (API · JWT)
    └── Project: Writing
        ├── App: write-web
        └── App: write-api
```

**A project per app**, because they are separate products with separate billing. **One
organization**, because organizations model tenants and there is one. **No roles defined** —
see `README.md`.

Per SPA:
- Redirect URI `https://map.byfauzi.com/callback`, post-logout
  `https://map.byfauzi.com/`. Register **exact** URIs; wildcards are an open-redirect.
- Auth Code + PKCE, **no client secret**.
- Token type **JWT**, not opaque (D1) — this is a per-app setting and the default is not
  always what you want.
- Scopes `openid profile email`, plus the project-audience scope
  `urn:zitadel:iam:org:project:id:{projectId}:aud` so the API is named in `aud`.
- **No `offline_access`** — D2 says no refresh token in the browser.

Per API app: note its project id, and validate on every request that **your** audience is
present. With two apps sharing an instance this is not hygiene — it is what stops a token
minted for the writing app from being accepted by the map API.

Upstream logins (Google, GitHub, email/password) are configured once at the organization
and apply to every project.

## 6. What each app stores

Zitadel owns identity. An app's `users` row is an **anchor and a cache**, never a second
source of truth.

```sql
-- <app>.users — this app's anchor for a Zitadel identity.
-- NOT the source of truth for who this person is. Zitadel is.
users(
  id           uuid primary key,          -- ours; generated here
  zitadel_sub  text unique not null,      -- theirs; a numeric snowflake string, NOT a uuid

  -- Cache of Zitadel claims. Refreshed from the token, never written by this app,
  -- never authoritative, safe to truncate and rebuild.
  email             text,
  display_name      text,
  profile_synced_at timestamptz,

  created_at   timestamptz not null default now()
)
```

**Why a local `uuid` primary key and not the `sub` itself.** Two reasons. Zitadel issues
numeric snowflake ids (`218213947283746501`), which a `uuid` column physically cannot hold.
And making their identifier your primary key points every foreign key in your database at a
value another system owns — changing IdP would then rewrite every table instead of one
column.

**Provisioning is lazy and per app.** Registration happens once, in Zitadel. A row here is
created the first time that person uses *this* app; someone who only ever uses the writing
app correctly has no row in `mapapp`.

**Profile edits self-heal.** Refresh the cache from the access token's claims, comparing
before writing so the common case is a string comparison and no write. Two guards:

1. **Never write `NULL` from a missing claim.** A token arriving without profile claims must
   leave the cache alone, or a config change silently blanks every display name.
2. **Confirm the claims are in the *access* token**, not only the ID token — the API never
   sees the ID token. If enabling them proves fiddly, call the **userinfo** endpoint once per
   session instead. Both are correct; check what a real token contains and pick then.

The cache earns its place on the public share page, which renders for an anonymous visitor
with no token at all — the author's name can only come from here.

**Deletion needs a cron** (D5), because nothing will tell you a row should stop existing.
Daily, per app: walk `users`, ask the Management API about each `sub`, purge what is gone.
This matters legally, not just tidily — those rows hold cached email addresses.

## 7. Integration checklist for an app

1. Discovery at `https://auth.byfauzi.com/.well-known/openid-configuration`; cache JWKS.
2. Validate signature, `iss`, **`aud`**, `exp` on every request. `sub` → user.
3. Upsert the local row on first call of a session; `select` by `sub` afterwards.
4. Access token **in memory only**. Never `localStorage`.
5. Renew with `prompt=none` — top-level redirect on load, hidden iframe mid-session.
6. Handle `error=login_required` by rendering the **logged-out** state. An app that
   redirects again on that error is an infinite loop, and it is the most common bug in this
   flow.
7. **Never block boot on auth.** ADR-07: the map editor renders anonymous and fully usable
   first; the silent check runs in the background and only swaps in signed-in chrome if it
   succeeds.
8. Sign out via `end_session_endpoint` (D3).
9. Ship a **strict CSP**. It outranks every token-storage decision above.
