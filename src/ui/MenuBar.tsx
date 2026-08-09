import { Check, ChevronRight, Circle, Moon, Sun, Wand2 } from "lucide-react";
import { Menubar } from "radix-ui";
import type { ReactNode } from "react";
import type { SaveStatus } from "../persistence/useAutosave";
import { CANVAS_PRESETS, type CanvasPreset } from "../scene/types";
import { useEditorStore } from "../state/editorStore";
import { useThemeStore } from "../state/themeStore";
import { Link } from "./Link";
import {
  button,
  divider,
  iconButton,
  menuBar,
  menuContent,
  menuIndicator,
  menuItem,
  menuSeparator,
  menuShortcut,
  menuTrigger,
  titleInput,
} from "./variants";

/**
 * The menu bar — WP-32, `11` §3–§4.
 *
 * **A menu holds commands and rarely-changed settings; a rail holds live state you steer while
 * looking at the map.** Everything here is the first half of that sentence, which is why ring
 * count and ring gap are *not* here: you drag those at the map and watch the bands re-derive.
 *
 * All of the menu behaviour — keyboard navigation, Escape, typeahead, focus return, `role="menu"`
 * — comes from Radix's `DropdownMenu`, already a dependency. None of it is written here.
 *
 * **`New map` and `Open Map…` are deliberately absent** (ADR-40): this menu owns *this* map, and
 * the gallery page owns *which* map. The brand mark is the way back, and it is a real link
 * because Back only works if you arrived from `/maps` — which a bookmarked map did not.
 */

const PRESETS: CanvasPreset[] = ["landscape", "square", "portrait"];

const SAVE_LABEL: Record<SaveStatus, string> = {
  new: "saves as you work",
  saving: "saving…",
  saved: "saved",
  failed: "not saved",
};

interface Props {
  saveStatus: SaveStatus;
  /** Which rails are showing — the View menu's two checkboxes (`11` §3). */
  panels: { tools: boolean; layers: boolean };
  onTogglePanel: (panel: "tools" | "layers") => void;
  onResetCanvas: (preset: CanvasPreset) => void;
  onGenerate: () => void;
  onExport: () => void;
  onShortcuts: () => void;
}

export function MenuBar({
  saveStatus,
  panels,
  onTogglePanel,
  onResetCanvas,
  onGenerate,
  onExport,
  onShortcuts,
}: Props) {
  const title = useEditorStore((s) => s.scene.meta.title);
  const preset = useEditorStore((s) => s.scene.meta.canvas.preset);
  const canvas = useEditorStore((s) => s.scene.meta.canvas);
  const setTitle = useEditorStore((s) => s.setTitle);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const past = useEditorStore((s) => s.past);
  const future = useEditorStore((s) => s.future);
  const selection = useEditorStore((s) => s.selection);
  const deleteSelection = useEditorStore((s) => s.deleteSelection);
  const restackSelection = useEditorStore((s) => s.restackSelection);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);

  return (
    <header className={menuBar()}>
      <Link
        to="/maps"
        data-action="gallery"
        aria-label="Your maps"
        title="Your maps"
        className="mbf:bg-accent mbf:text-panel mbf:font-display mbf:mr-1 mbf:grid mbf:size-6 mbf:shrink-0 mbf:place-items-center mbf:rounded-md mbf:text-xs"
      >
        M
      </Link>

      <Menubar.Root className="mbf:flex mbf:items-center mbf:gap-0.5">
        <Menu label="Map">
          <Menubar.Sub>
            <Menubar.SubTrigger className={menuItem()} data-menu-item="canvas-size">
              Canvas size
              <ChevronRight size={12} className={menuShortcut()} />
            </Menubar.SubTrigger>
            <Menubar.Portal>
              <Menubar.SubContent className={menuContent()} sideOffset={2}>
                {/*
                A radio group, not three commands: what you are already on is a *value*, so the
                menu shows it rather than offering it (`11` §3). Radix still fires
                `onValueChange` for the active item, so the no-op guard stays — what changed is
                that you can now see which one you are on before you reach for it.
              */}
                <Menubar.RadioGroup
                  value={preset}
                  onValueChange={(next) => next !== preset && onResetCanvas(next as CanvasPreset)}
                >
                  {PRESETS.map((option) => (
                    <Menubar.RadioItem
                      key={option}
                      value={option}
                      className={menuItem()}
                      data-preset={option}
                      data-preset-active={option === preset || undefined}
                    >
                      <Menubar.ItemIndicator className={menuIndicator()}>
                        <Circle size={7} fill="currentColor" />
                      </Menubar.ItemIndicator>
                      <span className="mbf:capitalize">{option}</span>
                      <span className={menuShortcut()}>
                        {CANVAS_PRESETS[option].w}×{CANVAS_PRESETS[option].h}
                      </span>
                    </Menubar.RadioItem>
                  ))}
                </Menubar.RadioGroup>
              </Menubar.SubContent>
            </Menubar.Portal>
          </Menubar.Sub>

          <Menubar.Item
            className={menuItem()}
            data-action="reset"
            onSelect={() => onResetCanvas(preset)}
          >
            Reset canvas…
          </Menubar.Item>
          <Menubar.Separator className={menuSeparator()} />
          <Menubar.Item className={menuItem()} data-menu-item="generate" onSelect={onGenerate}>
            Generate world…
          </Menubar.Item>
          <Menubar.Item className={menuItem()} data-menu-item="export" onSelect={onExport}>
            Export image…
          </Menubar.Item>
        </Menu>

        <Menu label="Edit">
          {/*
          `data-menu-item`, **not** `data-action="undo"` — the toolbar still owns that value and
          `11` §7's rule is that a hook keeps its value on whichever element it *moves* to.
          Copying one onto a second element is the case the rule does not cover, and it is
          worse: every existing selector silently resolves to document order instead of failing.
          A driver clicking `[data-action="undo"]` with this menu open hits the toolbar button
          behind Radix's overlay, and nothing happens at all.
        */}
          <Menubar.Item
            className={menuItem()}
            data-menu-item="undo"
            disabled={past.length === 0}
            onSelect={undo}
          >
            Undo <span className={menuShortcut()}>Ctrl+Z</span>
          </Menubar.Item>
          <Menubar.Item
            className={menuItem()}
            data-menu-item="redo"
            disabled={future.length === 0}
            onSelect={redo}
          >
            Redo <span className={menuShortcut()}>Ctrl+Shift+Z</span>
          </Menubar.Item>
          <Menubar.Separator className={menuSeparator()} />
          {/*
          Deliberate duplication of a *command* (`11` §2): these are high-frequency during a
          selection so the rail keeps them, and undiscoverable so the menu lists them with their
          shortcuts. Unlike the two Generate buttons, which were duplication by accident — and
          both surfaces call the same store action, so there is one implementation either way.
        */}
          <Menubar.Item
            className={menuItem()}
            data-menu-item="forward"
            disabled={selection.length === 0}
            onSelect={() => restackSelection(1)}
          >
            Bring forward
          </Menubar.Item>
          <Menubar.Item
            className={menuItem()}
            data-menu-item="back"
            disabled={selection.length === 0}
            onSelect={() => restackSelection(-1)}
          >
            Send back
          </Menubar.Item>
          <Menubar.Item
            className={menuItem()}
            data-menu-item="delete"
            disabled={selection.length === 0}
            onSelect={deleteSelection}
          >
            Delete selected <span className={menuShortcut()}>Del</span>
          </Menubar.Item>
        </Menu>

        <Menu label="View">
          <Menubar.CheckboxItem
            className={menuItem()}
            data-menu-item="panel-tools"
            checked={panels.tools}
            onSelect={(event) => {
              event.preventDefault(); // keep the menu open: these two are usually set together
              onTogglePanel("tools");
            }}
          >
            <Menubar.ItemIndicator className={menuIndicator()}>
              <Check size={12} />
            </Menubar.ItemIndicator>
            Tool options
          </Menubar.CheckboxItem>
          <Menubar.CheckboxItem
            className={menuItem()}
            data-menu-item="panel-layers"
            checked={panels.layers}
            onSelect={(event) => {
              event.preventDefault();
              onTogglePanel("layers");
            }}
          >
            <Menubar.ItemIndicator className={menuIndicator()}>
              <Check size={12} />
            </Menubar.ItemIndicator>
            Layers panel
          </Menubar.CheckboxItem>
        </Menu>

        <Menu label="Help">
          <Menubar.Item className={menuItem()} data-menu-item="shortcuts" onSelect={onShortcuts}>
            Keyboard shortcuts…
          </Menubar.Item>
          {/*
          `11` §3 called this "About". It is a real page rather than a dialog about a version
          number — and it opens in a new tab, because Help must not take you off the map you
          are drawing.
        */}
          <Menubar.Item className={menuItem()} asChild>
            <a href="/how-it-works" target="_blank" rel="noreferrer" data-menu-item="about">
              About map.byfauzi
            </a>
          </Menubar.Item>
        </Menu>
      </Menubar.Root>

      <span className={divider()} />

      {/*
        The map's name, where a document's name lives in every editor — which removes a
        `Rename…` command rather than adding one (`11` §3). `stopPropagation` because the
        editor's global Ctrl+Z only spares `INPUT|TEXTAREA|SELECT` by tag, and this input must
        keep its own undo.
      */}
      <input
        data-map-title
        aria-label="Map name"
        value={title}
        placeholder="Untitled Map"
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => event.stopPropagation()}
        className={titleInput()}
        size={Math.max(12, Math.min(28, title.length + 2))}
      />
      <span className="mbf:text-muted mbf:hidden mbf:font-mono mbf:text-[10px] mbf:lg:inline">
        {canvas.w}×{canvas.h}
      </span>

      <span className="mbf:grow" />

      {/* The autosave strip, absorbed (`11` §4) — so two rows cost no more height than one. */}
      <span data-autosave className="mbf:text-muted mbf:text-[11px]">
        {SAVE_LABEL[saveStatus]}
      </span>

      {/*
        Theme stays a button rather than becoming a menu item: it is one click today, and a
        menu bar is for grouping many commands, not for hiding the one that is already a
        single control.
      */}
      <button
        type="button"
        data-action="theme"
        aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"}
        className={iconButton()}
        onClick={toggleTheme}
      >
        {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
      </button>
      <button type="button" data-action="generate-open" className={button()} onClick={onGenerate}>
        <Wand2 size={13} /> Generate
      </button>
      <button
        type="button"
        data-action="export-open"
        className={button({ tone: "primary" })}
        onClick={onExport}
      >
        Export
      </button>
    </header>
  );
}

/**
 * One menu in the bar.
 *
 * **`Menubar`, not four independent `DropdownMenu`s** — which is a correction to `11` §6, and
 * the reason is the defect it fixes: each dropdown is its own modal dismiss layer, so with one
 * open a click on another trigger was swallowed closing the first, and reaching the next menu
 * took **two clicks**. A menu bar is a single roving widget, so an open menu hands over on one
 * click — and arrow keys move between menus, which four dropdowns could never do.
 */
function Menu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Menubar.Menu>
      <Menubar.Trigger className={menuTrigger()} data-menu={label.toLowerCase()}>
        {label}
      </Menubar.Trigger>
      <Menubar.Portal>
        <Menubar.Content className={menuContent()} align="start" sideOffset={4}>
          {children}
        </Menubar.Content>
      </Menubar.Portal>
    </Menubar.Menu>
  );
}
