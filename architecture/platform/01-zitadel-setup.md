# Zitadel — setup, registration and integration

> **⚠️ This document belongs in `fauzialz/infra`, not in this repository.** It is written
> paste-ready so that when the infra repo exists, the compose file, the nginx sites and the
> registration steps can be lifted out unchanged. Nothing here is map-specific.
>
> **Nothing in this document is built yet.** P0 ships frontend-only; the whole stack below
> arrives with **P2 WP-1** (`../v1/prompts/phase-2-accounts-persistence.md`).

Decided in **ADR-06** (Zitadel as the IdP), **ADR-34** (topology) and **ADR-46** (nginx, not
Caddy). D1–D5 are in `README.md`.

---

## 1. What runs

**nginx runs on the host**, not in the compose project — it is already there, fronting
other sites on this box, and it owns `:80`/`:443` (ADR-46). The compose project holds two
containers and publishes them **to loopback only**, so nginx is the sole way in.

```
nginx      :443   host service — TLS, routing, serves each app's static build
zitadel    127.0.0.1:8080   OIDC — auth.byfauzi.com
postgres   (no published port)   three databases: zitadel · mapapp · writeapp
```

`127.0.0.1:8080`, not `8080` — a bare port mapping publishes on every interface, and
Docker writes its own iptables rules that a host firewall does not necessarily cover. The
loopback bind is what makes "nginx is the only door" true rather than intended.

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
    ports: ["127.0.0.1:8080:8080"]     # loopback only — nginx on the host is the way in
    depends_on:
      postgres:
        condition: service_healthy

volumes: { pgdata: {} }
```

**There is no web-server container** (ADR-46). nginx is a host service, so each app's built
`dist/` is a directory on the host that nginx reads directly — no bind mount into a
container, and no `:ro` volume to get wrong.

`--tlsMode external` is correct **because nginx terminates TLS**. Zitadel speaks plain HTTP
to loopback and still believes it is reachable over HTTPS, which is what
`ZITADEL_EXTERNALSECURE: "true"` tells it.

## 3. Four settings that cause confusing failures

Each of these produces a symptom that does not name its cause.

| | Setting | If wrong |
|---|---|---|
| **1** | `ZITADEL_MASTERKEY` must be **exactly 32 bytes** | container refuses to start, with a message about key length that is easy to read as a config-file problem. Generate with `openssl rand -base64 32 \| head -c 32`. **Lose it and the instance is unrecoverable** — back it up before first boot. |
| **2** | `ZITADEL_EXTERNALDOMAIN` / `EXTERNALPORT` / `EXTERNALSECURE` must match how a **browser** reaches it | login *appears* to work, then the redirect goes to the wrong host, or issuer validation fails in your API. The discovery document is built from these values. |
| **3** | nginx must forward the **original Host** header | as above, intermittently. **nginx does not do this by default** — `proxy_pass` sends the *upstream's* host unless you write `proxy_set_header Host $host;`. Caddy defaulted to the right thing here and nginx does not, so this line is now load-bearing rather than a warning against meddling. |
| **4** | **iframe embedding policy** must allow your app origins | silent renewal (D2) fails with no visible error, and users get logged out when their access token expires. Set it in the instance security settings once the apps exist. |

## 4. nginx sites

**ADR-46**: nginx, not Caddy — the box already runs it in front of a live site, and the
automatic-certificate feature Caddy would be chosen for is unusable behind a Cloudflare
Origin cert. TLS is that cert: nothing to renew, no ACME challenge to route around.

`/etc/nginx/sites-available/map.byfauzi.com`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name map.byfauzi.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;          # nginx 1.24 (Ubuntu 24.04). On 1.25+ the parameter is
    listen [::]:443 ssl http2;     # deprecated — drop it and write `http2 on;` instead.
    server_name map.byfauzi.com;

    ssl_certificate     /etc/ssl/cloudflare/byfauzi-origin.pem;
    ssl_certificate_key /etc/ssl/cloudflare/byfauzi-origin.key;

    root /var/www/map/current;     # a relative symlink to the live releases/<sha>
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;

    # P2: uncomment when the API exists — same origin, so no CORS, ever.
    # location ^~ /api/ { proxy_pass http://127.0.0.1:8081; include proxy_params; }

    # P2's share and embed pages are server-rendered for their meta tags. Unlike Caddy's
    # `handle` blocks these need no ordering care: nginx picks the LONGEST matching
    # prefix, so `^~ /s/` beats `/` wherever it sits in the file.
    # location ^~ /s/     { proxy_pass http://127.0.0.1:8081; include proxy_params; }
    # location ^~ /embed/ { proxy_pass http://127.0.0.1:8081; include proxy_params; }

    # The application. One HTML file for every route under /maps; the client router
    # reads the path. Mirrored by the dev-server middleware in `vite.config.ts` — the
    # two hold one rule in two places, and "works locally, 404s in production" has
    # exactly one signal, which is a deploy.
    location =  /maps  { try_files /app.html =404; }
    location ^~ /maps/ { try_files /app.html =404; }

    # Content-hashed bundles and the self-hosted fonts — there is no CDN fallback for
    # those, so this is a requirement rather than a tuning knob. HTML gets the opposite:
    # `no-cache` means revalidate, so a stale entry can never outlive its assets.
    location ^~ /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        try_files $uri =404;
    }

    # Everything else is a static page: the landing page at /, /how-it-works, and an
    # HTML 404 for an unknown path, which never loads the application bundle.
    location / {
        add_header Cache-Control "no-cache" always;
        try_files $uri $uri.html $uri/index.html =404;
    }

    error_page 404 /404.html;
    location = /404.html { internal; add_header Cache-Control "no-cache" always; }
}
```

`/etc/nginx/sites-available/auth.byfauzi.com`:

```nginx
server {
    listen 443 ssl http2;
    server_name auth.byfauzi.com;

    ssl_certificate     /etc/ssl/cloudflare/byfauzi-origin.pem;
    ssl_certificate_key /etc/ssl/cloudflare/byfauzi-origin.key;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;      # §3 item 3 — NOT nginx's default
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    }

    # Native gRPC — a Go service calling the Management API — needs grpc_pass, because
    # nginx cannot reach an h2c upstream through proxy_pass at all. gRPC-Web rides
    # HTTP/1.1 and is likely fine on the block above. VERIFY both against the Zitadel
    # version you pin rather than trusting this comment: Caddy did the whole job in one
    # `versions h2c 2` line, and this is the one place ADR-46 costs something.
    location ^~ /zitadel. { grpc_pass grpc://127.0.0.1:8080; }
}
```

Enable and apply — `-t` first, so a bad config never reaches the running server and the
other sites on this box stay up:

```sh
sudo ln -s ../sites-available/map.byfauzi.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Two nginx behaviours worth knowing before editing this:

- **`add_header` does not inherit** into a `location` that declares its own — it is
  replaced wholesale, not merged. Any header that must apply everywhere gets repeated.
  **`auth_basic` is the opposite and does inherit.** Two directives, opposite rules.
- **`error_page 404 /404.html` plus `internal`** returns the 404 body *with* a 404 status.
  Serving that file from an ordinary `location` instead returns 200 with a page that says
  "not found" — invisible in a browser, wrong for every crawler and every check.

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
