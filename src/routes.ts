import { useEffect, useSyncExternalStore } from "react";
import { flushAutosave } from "./persistence/useAutosave";

/**
 * The address space — three SPA routes, one parameter, no nesting (`14` §4.1).
 *
 * Hand-rolled for the reason this repo keeps giving: `location.pathname`, `pushState` and one
 * `popstate` listener already *are* a router at this size, the same call as raw IndexedDB
 * (WP-12) and a WebSocket instead of Playwright (`07` §1). Revisit at P2's nested or guarded
 * routes, or on a measurement showing route-level code splitting is worth having.
 *
 * The rest of this file is the part the primitive does not give you, and skipping it is why
 * hand-rolled routers have a reputation: a per-route title, the scroll position a Back to a
 * list should return to, and focus that moves to the new page.
 */

export type Route =
  { name: "maps" } | { name: "create" } | { name: "editor"; id: string } | { name: "unknown" };

/**
 * Anything after `/maps/edit/` is taken as an id. A bad one is the *map's* problem to report
 * — it redirects to `/maps` with a toast (§4.4) — so there is no uuid shape to keep in step
 * with `crypto.randomUUID`, and a malformed id and a deleted one fail the same way.
 */
export function matchRoute(path: string): Route {
  const clean = path.replace(/\/+$/, "") || "/";
  if (clean === "/maps") return { name: "maps" };
  if (clean === "/maps/create") return { name: "create" };
  const edit = /^\/maps\/edit\/(.+)$/.exec(clean);
  return edit ? { name: "editor", id: decodeURIComponent(edit[1]) } : { name: "unknown" };
}

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((notify) => notify());

if (typeof window !== "undefined") window.addEventListener("popstate", emit);

/** The live route. The snapshot is `location.pathname` itself — one source of truth, and a
 *  string, which is the stable identity `useSyncExternalStore` insists on. */
export const useRoute = (): Route =>
  matchRoute(
    useSyncExternalStore(
      (notify) => {
        listeners.add(notify);
        return () => void listeners.delete(notify);
      },
      () => location.pathname,
    ),
  );

/**
 * Go somewhere, client-side.
 *
 * **The flush is not optional** (§4.7, trap 4): autosave throttles at 800 ms and flushes on
 * `pagehide` / `visibilitychange`, and *neither fires on a route change*. Without this line
 * the last edits before clicking a link are lost. It lives here rather than in `<Link>` so
 * every navigation pays it — the redirects included.
 *
 * `replace` is what keeps Back honest: a finished setup step and a redirect that bounced
 * straight off must not become Back targets (traps 1 and 2).
 */
export async function navigate(to: string, options: { replace?: boolean } = {}): Promise<void> {
  if (to === location.pathname) return;
  await flushAutosave();
  // Stamp where this entry was scrolled to before leaving it, so Back can put it back.
  history.replaceState({ ...(history.state as object | null), scrollY: window.scrollY }, "");
  if (options.replace) history.replaceState(null, "", to);
  else history.pushState(null, "", to);
  emit();
}

/** Where this history entry was scrolled to when we last left it. Restored by the page that
 *  scrolls, once its content is in — a `scrollTo` before then has nothing to scroll. */
export const savedScroll = (): number =>
  (history.state as { scrollY?: number } | null)?.scrollY ?? 0;

/**
 * Title and focus for a route.
 *
 * A real page load moves focus to the new document; `pushState` does not, so a keyboard or
 * screen-reader user would still be standing on the link they just followed. Pages mark
 * their heading with `data-page-heading` (and `tabIndex={-1}`); the editor has no heading to
 * take, so it gets the title and nothing else.
 */
export function usePage(title: string): void {
  useEffect(() => {
    document.title = title;
    document.querySelector<HTMLElement>("[data-page-heading]")?.focus();
  }, [title]);
}
