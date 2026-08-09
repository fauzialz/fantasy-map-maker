import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { Connect, PluginOption } from "vite";
import { defineConfig } from "vitest/config";

/**
 * The routing rule, held locally exactly as Caddy holds it in production
 * (`architecture/v1/14-routing-and-landing.md` §4.1, `architecture/platform/01-zitadel-setup.md` §4).
 *
 * Vite's default `appType: "spa"` falls back to the root `index.html` for every unmatched
 * path, which would serve the **landing page** at `/maps/create`. `"mpa"` serves HTML by
 * literal path instead — correct for the static pages, and a 404 for every SPA route until
 * this middleware puts them on `app.html`.
 *
 * It is not optional polish: **every CDP driver in this repo runs against the dev server**
 * (`07` §1), so if dev routing is wrong, nothing in this batch can be verified at all. The two
 * copies must agree — "works locally, 404s in production" has exactly one signal, and it is a
 * deploy.
 */
const routing = (): Connect.NextHandleFunction => (req, res, next) => {
  const path = (req.url ?? "/").split("?")[0];
  // Nothing under /maps is ever a file, so this cannot swallow an asset request.
  if (path === "/maps" || path.startsWith("/maps/")) req.url = "/app.html";
  // WP-31's landing page goes here. Until it lands, `/` is a redirect rather than a
  // half-built page — the same one line Caddy holds, so the two stay in step.
  else if (path === "/") {
    res.writeHead(302, { location: "/maps" });
    return res.end();
  }
  next();
};

const routes = (): PluginOption => ({
  name: "map-routes",
  configureServer: (server) => void server.middlewares.use(routing()),
  configurePreviewServer: (server) => void server.middlewares.use(routing()),
});

export default defineConfig({
  plugins: [react(), tailwindcss(), routes()],
  appType: "mpa",
  build: { rollupOptions: { input: { app: "app.html" } } },
  // ponytail: node environment — the engine is pure functions. A DOM environment gets
  // added when a test actually needs canvas/Worker.
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
