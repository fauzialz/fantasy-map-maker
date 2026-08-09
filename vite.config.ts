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
const routing = (): Connect.NextHandleFunction => (req, _res, next) => {
  const path = (req.url ?? "/").split("?")[0];
  // Nothing under /maps is ever a file, so this cannot swallow an asset request.
  if (path === "/maps" || path.startsWith("/maps/")) req.url = "/app.html";
  // Extensionless static pages, as Caddy's `try_files {path} {path}.html` serves them.
  else if (path === "/how-it-works") req.url = "/how-it-works.html";
  // Caddy's `handle_errors`, locally. Gated on the `Accept` header rather than on the shape
  // of the path, because that is what separates a navigation from Vite's own `/@vite/client`
  // and `/__vite_ping` — both extensionless too, and both would otherwise get a 404 page.
  // The *page* matches production; the status does not, because Vite serves HTML as 200 and
  // overwrites anything set here. The status is Caddy's to give.
  else if ((req.headers.accept ?? "").includes("text/html") && path !== "/" && !path.includes("."))
    req.url = "/404.html";
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
  build: {
    rollupOptions: {
      // One entry per served HTML file. The landing pages carry no script at all — they are
      // in here for the stylesheet they share with the app, which is the point (`14` §5).
      input: {
        app: "app.html",
        landing: "index.html",
        howItWorks: "how-it-works.html",
        notFound: "404.html",
      },
    },
  },
  // ponytail: node environment — the engine is pure functions. A DOM environment gets
  // added when a test actually needs canvas/Worker.
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
