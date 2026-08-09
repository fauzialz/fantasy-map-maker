import { tv } from "tailwind-variants";

/**
 * Every prefixed class string in the app lives here (`06-frontend-styling.md`), so JSX
 * stays readable and a prefix change is one file. Colours are all token-backed, which is
 * why almost nothing needs the `dark:` variant — the tokens flip underneath.
 */

export const panel = tv({
  base: "mbf:bg-panel mbf:border-line mbf:flex mbf:flex-col mbf:gap-4 mbf:overflow-y-auto mbf:p-3",
  variants: {
    side: { left: "mbf:w-60 mbf:border-r", right: "mbf:w-64 mbf:border-l" },
  },
});

export const panelTitle = tv({
  base: "mbf:text-muted mbf:flex mbf:items-center mbf:gap-2 mbf:text-[11px] mbf:font-semibold mbf:tracking-wider mbf:uppercase",
});

export const hint = tv({ base: "mbf:text-muted mbf:text-[11px] mbf:leading-snug" });

export const field = tv({ base: "mbf:flex mbf:flex-col mbf:gap-1.5" });

export const fieldLabel = tv({
  base: "mbf:flex mbf:items-center mbf:justify-between mbf:gap-2 mbf:text-xs",
});

export const fieldValue = tv({ base: "mbf:text-muted mbf:font-mono mbf:text-[11px]" });

export const button = tv({
  base:
    "mbf:inline-flex mbf:cursor-pointer mbf:items-center mbf:justify-center mbf:gap-1.5 mbf:rounded-lg mbf:border " +
    "mbf:px-2.5 mbf:py-1.5 mbf:text-xs mbf:font-medium mbf:transition-colors mbf:select-none " +
    "mbf:focus-visible:outline-accent mbf:focus-visible:outline-2 mbf:focus-visible:outline-offset-1 " +
    "mbf:disabled:pointer-events-none mbf:disabled:opacity-40",
  variants: {
    tone: {
      default: "mbf:border-line mbf:bg-panel mbf:text-ink mbf:hover:bg-panel-2",
      primary:
        "mbf:border-accent mbf:bg-accent mbf:text-panel mbf:hover:opacity-90 mbf:dark:text-ground",
      ghost: "mbf:border-transparent mbf:text-muted mbf:hover:bg-panel-2 mbf:hover:text-ink",
      danger: "mbf:border-danger/40 mbf:text-danger mbf:hover:bg-danger/10",
    },
    block: { true: "mbf:w-full" },
  },
  defaultVariants: { tone: "default" },
});

/** Toolbar tools and any other pressed-state control. */
export const toolButton = tv({
  base:
    "mbf:inline-flex mbf:cursor-pointer mbf:items-center mbf:gap-1.5 mbf:rounded-lg mbf:border mbf:border-transparent " +
    "mbf:px-2 mbf:py-1.5 mbf:text-xs mbf:transition-colors mbf:select-none " +
    "mbf:focus-visible:outline-accent mbf:focus-visible:outline-2 " +
    "mbf:disabled:pointer-events-none mbf:disabled:opacity-35",
  variants: {
    active: {
      true: "mbf:border-accent/40 mbf:bg-accent/12 mbf:text-accent-ink mbf:font-medium",
      false: "mbf:text-ink mbf:hover:bg-panel-2",
    },
  },
  defaultVariants: { active: false },
});

export const iconButton = tv({
  base:
    "mbf:inline-flex mbf:size-7 mbf:cursor-pointer mbf:items-center mbf:justify-center mbf:rounded-md " +
    "mbf:transition-colors mbf:focus-visible:outline-accent mbf:focus-visible:outline-2 " +
    "mbf:disabled:pointer-events-none mbf:disabled:opacity-30",
  variants: {
    active: {
      true: "mbf:bg-accent/12 mbf:text-accent-ink",
      false: "mbf:text-muted mbf:hover:bg-panel-2 mbf:hover:text-ink",
    },
  },
  defaultVariants: { active: false },
});

export const sliderRoot = tv({
  base: "mbf:relative mbf:flex mbf:h-4 mbf:w-full mbf:cursor-pointer mbf:touch-none mbf:items-center mbf:select-none mbf:data-[disabled]:opacity-40",
});
export const sliderTrack = tv({
  base: "mbf:bg-sink mbf:relative mbf:h-1 mbf:w-full mbf:grow mbf:rounded-full",
});
export const sliderRange = tv({ base: "mbf:bg-accent mbf:absolute mbf:h-full mbf:rounded-full" });
export const sliderThumb = tv({
  base:
    "mbf:border-accent mbf:bg-panel mbf:block mbf:size-3.5 mbf:rounded-full mbf:border-2 " +
    "mbf:focus-visible:outline-accent mbf:focus-visible:outline-2 mbf:focus-visible:outline-offset-1",
});

/**
 * The off state used to be `bg-sink` with no border, and `--sink` sits a hair from `--panel`
 * in both themes (`#E7ECE5` on `#FBFCFA` light, `#131A19` on `#18201F` dark) — so an off
 * switch was very nearly invisible against the panel it sits on, and any control it gated
 * read as permanently dead with nothing visible explaining why (`11-editor-shell.md` §5.2).
 *
 * `--muted` clears the WCAG 2.2 non-text minimum of 3:1 against `--panel` in both themes
 * (5.4:1 light, 6.3:1 dark), and the `bg-panel` thumb clears it against *both* track states
 * at once. `Toggle` is the only switch in the app, so this one variant repairs parchment,
 * coastal rings, river taper and sea level together.
 */
export const switchRoot = tv({
  base:
    "mbf:bg-muted mbf:data-[state=checked]:bg-accent mbf:border-line-strong mbf:data-[state=checked]:border-accent " +
    "mbf:relative mbf:flex mbf:h-4.5 mbf:w-8 mbf:shrink-0 mbf:cursor-pointer mbf:items-center mbf:rounded-full " +
    "mbf:border mbf:transition-colors mbf:focus-visible:outline-accent mbf:focus-visible:outline-2 " +
    "mbf:disabled:pointer-events-none mbf:disabled:opacity-40",
});
export const switchThumb = tv({
  base:
    "mbf:bg-panel mbf:block mbf:size-3.5 mbf:translate-x-0.5 mbf:rounded-full mbf:shadow-sm mbf:transition-transform " +
    "mbf:data-[state=checked]:translate-x-4",
});

export const switchRow = tv({
  base: "mbf:flex mbf:cursor-pointer mbf:items-center mbf:justify-between mbf:gap-2 mbf:text-xs",
});

export const layerRow = tv({
  base:
    "mbf:group mbf:flex mbf:w-full mbf:items-center mbf:gap-1.5 mbf:rounded-md mbf:px-1.5 mbf:py-1 " +
    "mbf:text-xs mbf:transition-colors",
  variants: {
    active: { true: "mbf:bg-accent/12 mbf:text-accent-ink", false: "mbf:hover:bg-panel-2" },
  },
  defaultVariants: { active: false },
});

export const dialogOverlay = tv({
  base: "mbf:fixed mbf:inset-0 mbf:z-40 mbf:bg-ink/35 mbf:backdrop-blur-[1px]",
});
export const dialogContent = tv({
  base:
    "mbf:bg-panel mbf:border-line mbf:fixed mbf:top-1/2 mbf:left-1/2 mbf:z-50 mbf:w-[min(26rem,calc(100vw-2rem))] " +
    "mbf:-translate-x-1/2 mbf:-translate-y-1/2 mbf:rounded-xl mbf:border mbf:p-5 mbf:shadow-2xl " +
    "mbf:focus-visible:outline-none",
});
export const dialogTitle = tv({
  base: "mbf:font-display mbf:text-ink mbf:mb-1 mbf:text-lg",
});
export const dialogDescription = tv({ base: "mbf:text-muted mbf:mb-4 mbf:text-xs" });
export const dialogActions = tv({ base: "mbf:mt-5 mbf:flex mbf:justify-end mbf:gap-2" });

export const toolbar = tv({
  base: "mbf:bg-panel mbf:border-line mbf:flex mbf:items-center mbf:gap-1 mbf:border-b mbf:px-3 mbf:py-2",
});

/**
 * The menu bar — WP-32's top row (`11` §4). Shorter than the tool row below it, because it
 * carries text rather than icons and the two rows together must not cost more height than the
 * one row plus the autosave strip they replace.
 */
export const menuBar = tv({
  base: "mbf:bg-panel mbf:border-line mbf:flex mbf:items-center mbf:gap-1 mbf:border-b mbf:px-3 mbf:py-1",
});

export const menuTrigger = tv({
  base:
    "mbf:text-ink mbf:hover:bg-panel-2 mbf:data-[state=open]:bg-panel-2 mbf:cursor-pointer " +
    "mbf:rounded-md mbf:px-2 mbf:py-1 mbf:text-xs mbf:select-none " +
    "mbf:focus-visible:outline-accent mbf:focus-visible:outline-2",
});

export const menuContent = tv({
  base:
    "mbf:bg-panel mbf:border-line mbf:z-50 mbf:min-w-52 mbf:rounded-lg mbf:border mbf:p-1 " +
    "mbf:shadow-xl mbf:focus-visible:outline-none",
});

/** `pl-7` on every item, radio or not, so labels line up whether or not a dot is showing. */
export const menuItem = tv({
  base:
    "mbf:text-ink mbf:data-[highlighted]:bg-accent/12 mbf:data-[highlighted]:text-accent-ink " +
    "mbf:relative mbf:flex mbf:cursor-pointer mbf:items-center mbf:gap-2 mbf:rounded-md " +
    "mbf:py-1.5 mbf:pr-2 mbf:pl-7 mbf:text-xs mbf:outline-none mbf:select-none " +
    "mbf:data-[disabled]:pointer-events-none mbf:data-[disabled]:opacity-40",
});

export const menuShortcut = tv({
  base: "mbf:text-muted mbf:ml-auto mbf:pl-6 mbf:font-mono mbf:text-[10px]",
});

export const menuSeparator = tv({ base: "mbf:bg-line mbf:my-1 mbf:h-px" });

/** The dot or tick a radio/checkbox item shows, in the gutter `menuItem` reserves for it. */
export const menuIndicator = tv({
  base: "mbf:text-accent mbf:absolute mbf:left-2 mbf:inline-flex mbf:items-center",
});

/** The map's name, in the menu bar — a document title, not a form field (`11` §3). */
export const titleInput = tv({
  base:
    "mbf:text-ink mbf:hover:border-line mbf:focus:border-accent mbf:min-w-0 mbf:rounded-md " +
    "mbf:border mbf:border-transparent mbf:bg-transparent mbf:px-1.5 mbf:py-0.5 mbf:text-xs " +
    "mbf:outline-none",
});

export const statusBar = tv({
  base:
    "mbf:bg-panel/85 mbf:border-line mbf:text-muted mbf:pointer-events-none mbf:absolute mbf:inset-x-0 mbf:bottom-0 " +
    "mbf:flex mbf:flex-wrap mbf:gap-x-4 mbf:gap-y-0.5 mbf:border-t mbf:px-3 mbf:py-1.5 mbf:font-mono mbf:text-[11px] " +
    "mbf:backdrop-blur-sm",
});

export const toast = tv({
  base:
    "mbf:bg-panel mbf:border-line mbf:text-ink mbf:pointer-events-auto mbf:flex mbf:items-center mbf:gap-3 " +
    "mbf:rounded-lg mbf:border mbf:px-3 mbf:py-2 mbf:text-xs mbf:shadow-lg",
});

export const segment = tv({ base: "mbf:flex mbf:flex-wrap mbf:gap-1" });

export const divider = tv({ base: "mbf:bg-line mbf:mx-1 mbf:h-5 mbf:w-px mbf:shrink-0" });
