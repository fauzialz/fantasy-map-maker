import {
  Brush,
  Castle,
  Eraser,
  Moon,
  Mountain,
  MousePointer2,
  Redo2,
  Sun,
  Trees,
  Type,
  Undo2,
  Wand2,
  Waves,
  type LucideIcon,
} from "lucide-react";
import type { LayerId } from "../scene/types";
import { LAYER_TOOLS, useEditorStore } from "../state/editorStore";
import { useThemeStore } from "../state/themeStore";
import { Hint } from "./controls";
import { button, divider, iconButton, toolbar, toolButton } from "./variants";

/**
 * The tool row is the editor's whole mode surface, and it is *contextual* — "Select" and
 * "Erase" act on whichever layer is live, which is ADR-18's rule that erasing removes
 * whatever the active tool makes. Everything here writes to the same store the panels
 * read, so the toolbar and the rails can never disagree about the mode.
 */

interface Tool {
  id: string;
  label: string;
  icon: LucideIcon;
  /** which layer this tool works on; absent = it modifies the current one */
  layer?: LayerId;
  hint: string;
}

const LAYER_TOOLBAR: Tool[] = [
  { id: "terrain", label: "Terrain", icon: Brush, layer: "terrain", hint: "Paint land" },
  {
    id: "mountains",
    label: "Mountains",
    icon: Mountain,
    layer: "mountains",
    hint: "Scatter peaks",
  },
  { id: "forests", label: "Forests", icon: Trees, layer: "forests", hint: "Scatter woodland" },
  { id: "rivers", label: "Rivers", icon: Waves, layer: "rivers", hint: "Draw a river" },
  { id: "icons", label: "Icons", icon: Castle, layer: "icons", hint: "Place a landmark" },
  { id: "labels", label: "Labels", icon: Type, layer: "labels", hint: "Name a place" },
];

/** What a layer does when you first switch to it. */
const DEFAULT_TOOL = (layer: LayerId) =>
  LAYER_TOOLS[layer]?.includes("scatter") ? "scatter" : "place";

interface Props {
  onGenerate: () => void;
  onExport: () => void;
}

export function Toolbar({ onGenerate, onExport }: Props) {
  const scene = useEditorStore((s) => s.scene);
  const activeLayerId = useEditorStore((s) => s.activeLayerId);
  const terrainTool = useEditorStore((s) => s.terrainTool);
  const objectTool = useEditorStore((s) => s.objectTool);
  const setActiveLayer = useEditorStore((s) => s.setActiveLayer);
  const setTerrainTool = useEditorStore((s) => s.setTerrainTool);
  const setObjectTool = useEditorStore((s) => s.setObjectTool);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const past = useEditorStore((s) => s.past);
  const future = useEditorStore((s) => s.future);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);

  const onTerrain = activeLayerId === "terrain";
  const tools = LAYER_TOOLS[activeLayerId];
  const erasing = onTerrain ? terrainTool === "sea" : objectTool === "erase";
  const selecting = !onTerrain && objectTool === "select";

  const pickLayer = (layer: LayerId) => {
    setActiveLayer(layer);
    if (layer === "terrain") setTerrainTool("brush");
    else setObjectTool(DEFAULT_TOOL(layer));
  };

  return (
    <header className={toolbar()}>
      <div className="mbf:mr-1 mbf:flex mbf:min-w-0 mbf:items-center mbf:gap-2">
        <span className="mbf:bg-accent mbf:text-panel mbf:font-display mbf:grid mbf:size-7 mbf:shrink-0 mbf:place-items-center mbf:rounded-md mbf:text-sm">
          M
        </span>
        <span className="mbf:min-w-0 mbf:leading-tight">
          <span className="mbf:block mbf:truncate mbf:text-xs mbf:font-medium">
            {scene.meta.title}
          </span>
          <span className="mbf:text-muted mbf:block mbf:font-mono mbf:text-[10px]">
            fantasy · {scene.meta.canvas.w}×{scene.meta.canvas.h}
          </span>
        </span>
      </div>

      <span className={divider()} />

      <div className="mbf:flex mbf:flex-wrap mbf:items-center mbf:gap-0.5">
        <Hint text={onTerrain ? "Terrain selection arrives with WP-14" : "Select and edit objects"}>
          <span>
            <button
              type="button"
              data-tool="select"
              className={toolButton({ active: selecting })}
              disabled={!tools?.includes("select")}
              onClick={() => setObjectTool("select")}
            >
              <MousePointer2 size={14} /> Select
            </button>
          </span>
        </Hint>

        {LAYER_TOOLBAR.map(({ id, label, icon: Icon, layer, hint }) => (
          <Hint key={id} text={hint}>
            <button
              type="button"
              data-tool={id}
              className={toolButton({
                active: activeLayerId === layer && !erasing && !selecting,
              })}
              onClick={() => layer && pickLayer(layer)}
            >
              <Icon size={14} /> {label}
            </button>
          </Hint>
        ))}

        <Hint
          text={
            onTerrain
              ? "Sea brush — erases land and can split a landmass"
              : `Erase ${activeLayerId}`
          }
        >
          <span>
            <button
              type="button"
              data-tool="erase"
              className={toolButton({ active: erasing })}
              disabled={!onTerrain && !tools?.includes("erase")}
              onClick={() => (onTerrain ? setTerrainTool("sea") : setObjectTool("erase"))}
            >
              <Eraser size={14} /> Erase
            </button>
          </span>
        </Hint>
      </div>

      <span className={divider()} />

      <Hint text="Undo (Ctrl+Z)">
        <span>
          <button
            type="button"
            data-action="undo"
            className={iconButton()}
            disabled={past.length === 0}
            onClick={undo}
          >
            <Undo2 size={15} />
          </button>
        </span>
      </Hint>
      <Hint text="Redo (Ctrl+Shift+Z)">
        <span>
          <button
            type="button"
            data-action="redo"
            className={iconButton()}
            disabled={future.length === 0}
            onClick={redo}
          >
            <Redo2 size={15} />
          </button>
        </span>
      </Hint>

      <span className="mbf:grow" />

      <Hint text={theme === "dark" ? "Switch to light" : "Switch to dark"}>
        <button type="button" data-action="theme" className={iconButton()} onClick={toggleTheme}>
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </Hint>
      <button type="button" className={button()} onClick={onGenerate}>
        <Wand2 size={14} /> Generate
      </button>
      <button type="button" className={button({ tone: "primary" })} onClick={onExport}>
        Export
      </button>
    </header>
  );
}
