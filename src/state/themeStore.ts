import { create } from "zustand";
import { refreshPalette } from "../canvas/palette";
import { clearTextureCache } from "../canvas/textures";
import { clearSpriteCache } from "../sprites/raster";
import { clearTextMetrics } from "../sprites/text";

export type Theme = "light" | "dark";

/**
 * ADR-24's one switch, in one place: flip `[data-theme]`, re-read the `--map-*` tokens
 * into `PALETTE`, and drop every cache that baked the old colours into pixels.
 *
 * `revision` is what makes the map follow. The Konva stage keys on it, so a bump rebuilds
 * every layer against the refreshed palette — cheap because a theme change is rare, and
 * far simpler than threading a colour dependency through six layer components. It also
 * carries the late arrival of a webfont, which changes how labels measure as well as draw.
 */
interface ThemeState {
  theme: Theme;
  revision: number;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
  /** Redraw for a reason other than colour — a font finished loading. */
  invalidate: () => void;
}

/**
 * A UI preference, not scene data — the acceptance forbids scene data in localStorage
 * (ADR-07), and this is two bytes that must be readable before the first paint to avoid a
 * flash of the wrong theme. IndexedDB cannot answer that early.
 */
const KEY = "mbf-theme";

function initialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  refreshPalette();
  clearTextureCache();
  clearSpriteCache();
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initialTheme(),
  revision: 0,

  setTheme: (theme) => {
    localStorage.setItem(KEY, theme);
    apply(theme);
    set((state) => ({ theme, revision: state.revision + 1 }));
  },

  toggle: () => get().setTheme(get().theme === "light" ? "dark" : "light"),

  invalidate: () => {
    clearTextMetrics();
    clearSpriteCache();
    set((state) => ({ revision: state.revision + 1 }));
  },
}));

/** Put the stored theme on the document before React's first render. */
export function initTheme(): void {
  apply(useThemeStore.getState().theme);
}
