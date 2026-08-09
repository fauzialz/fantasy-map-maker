import { Moon, Plus, Sun } from "lucide-react";
import { useCallback } from "react";
import { navigate, usePage } from "../routes";
import { useThemeStore } from "../state/themeStore";
import { Toasts } from "./Toasts";
import { Link } from "./Link";
import { MapGallery } from "./MapGallery";
import { button, iconButton } from "./variants";

/**
 * `/maps` — the gallery as a page (`14` §4.2).
 *
 * It was a modal until WP-30, which could assume a map was already open behind it. As the
 * only way to switch maps it has to handle arriving with nothing, and the honest answer to
 * "you have no maps" is the page that makes one — so an empty *and known* list
 * `replaceState`s to `/maps/create`. **Replace, not push**, or Back from the create page
 * returns here, redirects again, and the Back button is trapped in a loop (§4.7, trap 2).
 *
 * **Your maps**, not ADR-36's `Open Map…`: that objection was to a *command label* going
 * ambiguous once cloud maps join the list. A page heading is not a command, and the
 * possessive is the convention everywhere.
 */
export function MapsPage() {
  usePage("Your maps · map.byfauzi.com");
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);

  const onEmpty = useCallback(() => void navigate("/maps/create", { replace: true }), []);

  return (
    <div className="mbf:mx-auto mbf:flex mbf:max-w-5xl mbf:flex-col mbf:gap-5 mbf:p-6">
      <header className="mbf:flex mbf:items-center mbf:gap-3">
        <h1
          data-page-heading
          tabIndex={-1}
          className="mbf:font-display mbf:grow mbf:text-2xl mbf:outline-none"
        >
          Your maps
        </h1>
        <button type="button" data-action="theme" className={iconButton()} onClick={toggleTheme}>
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <Link to="/maps/create" data-action="new-map" className={button({ tone: "primary" })}>
          <Plus size={14} /> New map
        </Link>
      </header>

      <MapGallery onEmpty={onEmpty} />
      <Toasts />
    </div>
  );
}
