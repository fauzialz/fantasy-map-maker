import { ChevronsDown, ChevronsUp, Trash2 } from "lucide-react";
import type { Label } from "../scene/types";
import { restack } from "../scene/transform";
import { ICON_KINDS } from "../sprites/registry";
import { LAYER_OBJECT, LAYER_TOOLS, useEditorStore, type ObjectTool } from "../state/editorStore";
import { Slider, Toggle } from "./controls";
import { button, hint, panel, panelTitle, segment, toolButton } from "./variants";

/** What each placement mode is called on the layer that offers it (ADR-14, ADR-18). */
const TOOL_LABEL: Record<ObjectTool, string> = {
  select: "Select",
  scatter: "Scatter",
  place: "Place one",
  erase: "Erase",
};
const RIVER_TOOL_LABEL: Partial<Record<ObjectTool, string>> = { select: "Edit", place: "Draw" };

/**
 * The contextual left rail — options for whatever tool is in hand, and nothing else. It is
 * a second view of the same store the toolbar writes, never a second source of truth.
 */
export function ToolOptions({ onEditLabel }: { onEditLabel: (label: Label) => void }) {
  const scene = useEditorStore((s) => s.scene);
  const activeLayerId = useEditorStore((s) => s.activeLayerId);
  const brushSize = useEditorStore((s) => s.brushSize);
  const setBrushSize = useEditorStore((s) => s.setBrushSize);
  const terrainTool = useEditorStore((s) => s.terrainTool);
  const objectTool = useEditorStore((s) => s.objectTool);
  const setObjectTool = useEditorStore((s) => s.setObjectTool);
  const iconKind = useEditorStore((s) => s.iconKind);
  const setIconKind = useEditorStore((s) => s.setIconKind);
  const labelSize = useEditorStore((s) => s.labelSize);
  const setLabelSize = useEditorStore((s) => s.setLabelSize);
  const riverWidth = useEditorStore((s) => s.riverWidth);
  const setRiverWidth = useEditorStore((s) => s.setRiverWidth);
  const riverTaper = useEditorStore((s) => s.riverTaper);
  const setRiverTaper = useEditorStore((s) => s.setRiverTaper);
  const selection = useEditorStore((s) => s.selection);
  const setSettings = useEditorStore((s) => s.setSettings);
  const patchObject = useEditorStore((s) => s.patchObject);
  const removeObjects = useEditorStore((s) => s.removeObjects);
  const record = useEditorStore((s) => s.record);

  const onTerrain = activeLayerId === "terrain";
  const tools = LAYER_TOOLS[activeLayerId];
  const isObjectLayer = LAYER_OBJECT[activeLayerId] !== undefined;

  /** The one selected label, so the size slider edits the thing rather than the default. */
  const editingLabel =
    activeLayerId === "labels" && selection.length === 1
      ? (scene.layers
          .find((l) => l.id === "labels")
          ?.objects.find((o) => o.id === selection[0] && o.type === "label") as Label | undefined)
      : undefined;

  const restackSelection = (direction: 1 | -1) => {
    const state = useEditorStore.getState();
    const layer = state.scene.layers.find((l) => l.id === state.activeLayerId);
    if (!layer) return;
    state.record(direction === 1 ? "bring forward" : "send back", () =>
      state.setLayerObjects(
        state.activeLayerId,
        restack(layer.objects, new Set(state.selection), direction),
      ),
    );
  };

  return (
    <aside className={panel({ side: "left" })} aria-label="Tool options">
      <p className={panelTitle()}>Tool options · {activeLayerId}</p>

      {tools && (
        <div className={segment()}>
          {tools.map((tool) => (
            <button
              key={tool}
              type="button"
              data-mode={tool}
              className={toolButton({ active: objectTool === tool })}
              onClick={() => setObjectTool(tool)}
            >
              {(activeLayerId === "rivers" && RIVER_TOOL_LABEL[tool]) || TOOL_LABEL[tool]}
            </button>
          ))}
        </div>
      )}

      {(onTerrain || (isObjectLayer && objectTool !== "select" && objectTool !== "place")) && (
        <Slider
          label="Brush size"
          value={brushSize}
          min={40}
          max={800}
          step={10}
          display={`${brushSize} px`}
          onChange={setBrushSize}
        />
      )}

      {onTerrain && (
        <>
          <Slider
            label="Coast detail"
            value={scene.settings.coastDetail}
            min={0}
            max={1}
            step={0.05}
            display={scene.settings.coastDetail.toFixed(2)}
            hint="Smooth and stylised ↔ rough and natural."
            onChange={(coastDetail) =>
              record("coast detail", () => setSettings({ coastDetail }), true)
            }
          />
          <p className={hint()}>
            {terrainTool === "sea"
              ? "The sea brush removes land — cut a landmass through and it becomes two."
              : "Drag to paint land. Overlapping strokes merge into one coastline."}
          </p>
        </>
      )}

      {activeLayerId === "icons" && objectTool === "place" && (
        <div className={segment()}>
          {ICON_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className={toolButton({ active: iconKind === kind })}
              onClick={() => setIconKind(kind)}
            >
              {kind}
            </button>
          ))}
        </div>
      )}

      {activeLayerId === "labels" && (
        <>
          <Slider
            label="Text size"
            value={editingLabel?.size ?? labelSize}
            min={24}
            max={220}
            step={4}
            onChange={(size) => {
              if (editingLabel)
                record(
                  "resize label",
                  () => patchObject<Label>("labels", editingLabel.id, { size }),
                  true,
                );
              else setLabelSize(size);
            }}
          />
          {editingLabel && (
            <button
              type="button"
              className={button({ block: true })}
              onClick={() => onEditLabel(editingLabel)}
            >
              Rename “{editingLabel.text}”
            </button>
          )}
        </>
      )}

      {activeLayerId === "rivers" && (
        <>
          <Slider
            label="River width"
            value={riverWidth}
            min={6}
            max={90}
            step={2}
            onChange={setRiverWidth}
          />
          <Toggle label="Widen toward the mouth" checked={riverTaper} onChange={setRiverTaper} />
          <p className={hint()}>
            {objectTool === "place"
              ? "Click from source to sea. Double-click or Enter finishes, Escape cancels."
              : "Click a river to select it, drag its points to reshape, Delete removes it."}
          </p>
        </>
      )}

      {isObjectLayer && objectTool === "select" && (
        <>
          <p className={hint()}>
            {selection.length === 0
              ? "Click, shift-click or drag a marquee to select."
              : `${selection.length} selected · drag to move · corners scale · the stalk rotates.`}
          </p>
          <div className={segment()}>
            <button
              type="button"
              className={button()}
              disabled={selection.length === 0}
              onClick={() => restackSelection(1)}
            >
              <ChevronsUp size={13} /> Forward
            </button>
            <button
              type="button"
              className={button()}
              disabled={selection.length === 0}
              onClick={() => restackSelection(-1)}
            >
              <ChevronsDown size={13} /> Back
            </button>
          </div>
          <button
            type="button"
            className={button({ tone: "danger", block: true })}
            disabled={selection.length === 0}
            onClick={() =>
              record("delete", () =>
                removeObjects(activeLayerId, useEditorStore.getState().selection),
              )
            }
          >
            <Trash2 size={13} /> Delete selected
          </button>
        </>
      )}
    </aside>
  );
}
