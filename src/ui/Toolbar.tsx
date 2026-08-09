import {
  Brush,
  Castle,
  Eraser,
  Mountain,
  MousePointer2,
  Redo2,
  Trees,
  Type,
  Undo2,
  Waves,
  type LucideIcon,
} from "lucide-react";
import type { LayerId } from "../scene/types";
import { LAYER_TOOLS, useEditorStore } from "../state/editorStore";
import { Hint } from "./controls";
import { divider, iconButton, toolbar, toolButton } from "./variants";

/**
 * The tool row is the editor's whole mode surface, and — since WP-32 — *only* that.
 *
 * The brand, the map title, the theme button and the Generate/Export pair moved up to the menu
 * bar, which is what makes this a row about one thing: mode, then create (ADR-28's two axes),
 * with undo/redo at the far end. Everything here writes to the same store the panels read, so
 * the toolbar and the rails can never disagree about the mode.
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

export function Toolbar() {
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

  const onTerrain = activeLayerId === "terrain";
  // Select is a mode on every layer now, terrain included (ADR-28) — it is never a
  // capability the active layer has to grant. Since WP-26 the same is true of Erase
  // (ADR-37), so the two are peers in the mode group and neither is ever disabled.
  const selecting = objectTool === "select";
  const erasing = objectTool === "erase";
  /** A create tool is in hand — neither global mode is on. */
  const creating = !selecting && !erasing;
  const seaBrush = creating && onTerrain && terrainTool === "sea";

  /**
   * Reaching for a create tool always leaves the global modes.
   *
   * Since WP-18, `select` is a mode that survives a layer switch — which is right when you
   * are moving between layers to select on them, and wrong the moment you pick up a *tool*.
   * On the object layers the default tool overwrote it anyway; on terrain nothing did, so
   * clicking "Terrain" while selecting left the brush disabled and painting silently did
   * nothing. Terrain has no `objectTool` of its own, so any non-global value means "not
   * selecting and not erasing" — which is why `erase` joined this check with WP-26.
   */
  const leaveGlobalMode = () => !creating && setObjectTool("scatter");

  const pickLayer = (layer: LayerId) => {
    setActiveLayer(layer);
    if (layer === "terrain") {
      setTerrainTool("brush");
      leaveGlobalMode();
    } else setObjectTool(DEFAULT_TOOL(layer));
  };

  return (
    <header className={toolbar()}>
      {/*
        Mode, then create — two axes, not eight peers (ADR-28). Select acts on whatever is
        already on the map; the six below pick what a press makes. Flattening them into one
        row is what made Select read as a broken sibling of Mountains.
      */}
      <div className="mbf:flex mbf:items-center mbf:gap-0.5">
        <Hint text="Select and edit objects on any layer">
          <button
            type="button"
            data-tool="select"
            className={toolButton({ active: selecting })}
            onClick={() => setObjectTool("select")}
          >
            <MousePointer2 size={14} /> Select
          </button>
        </Hint>

        {/*
          Two tools, not one tool in two costumes (ADR-37). Erase is global and always
          available; the sea brush edits terrain *geometry*, so it appears only where there
          is geometry to edit and keeps its own name.
        */}
        <Hint text="Erase whole objects on every visible, unlocked layer">
          <button
            type="button"
            data-tool="erase"
            className={toolButton({ active: erasing })}
            onClick={() => setObjectTool("erase")}
          >
            <Eraser size={14} /> Erase
          </button>
        </Hint>

        {onTerrain && (
          <Hint text="Paints sea over land — can cut a landmass in two">
            <button
              type="button"
              data-tool="sea"
              className={toolButton({ active: seaBrush })}
              onClick={() => {
                setTerrainTool("sea");
                leaveGlobalMode(); // same trap as pickLayer: the sea brush is a create tool
              }}
            >
              <Waves size={14} /> Sea brush
            </button>
          </Hint>
        )}
      </div>

      <span className={divider()} />

      <div className="mbf:flex mbf:flex-wrap mbf:items-center mbf:gap-0.5">
        {LAYER_TOOLBAR.map(({ id, label, icon: Icon, layer, hint }) => (
          <Hint key={id} text={hint}>
            <button
              type="button"
              data-tool={id}
              className={toolButton({
                active: activeLayerId === layer && creating && !(layer === "terrain" && seaBrush),
              })}
              onClick={() => layer && pickLayer(layer)}
            >
              <Icon size={14} /> {label}
            </button>
          </Hint>
        ))}
      </div>

      <span className="mbf:grow" />

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
    </header>
  );
}
