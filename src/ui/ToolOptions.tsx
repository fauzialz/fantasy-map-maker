import { ChevronsDown, ChevronsUp, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { hasFootprint } from "../scene/bounds";
import { BIOME_FILL } from "../canvas/palette";
import type { Biome, Label, Landmass } from "../scene/types";
import { restack } from "../scene/transform";
import { ICON_KINDS } from "../sprites/registry";
import { LAYER_OBJECT, LAYER_TOOLS, useEditorStore, type ObjectTool } from "../state/editorStore";
import { Slider, Toggle } from "./controls";
import {
  button,
  field,
  fieldLabel,
  hint,
  panel,
  panelTitle,
  segment,
  toolButton,
} from "./variants";

/** What each placement mode is called on the layer that offers it (ADR-14, ADR-18). */
const TOOL_LABEL: Record<ObjectTool, string> = {
  select: "Select",
  scatter: "Scatter",
  place: "Place one",
  erase: "Erase",
};
// `select: "Edit"` left with WP-25. It was a third name for the global mode, and reshaping a
// river is Select's job now — dragging a control point outranks the frame's handles (WP-20).
const RIVER_TOOL_LABEL: Partial<Record<ObjectTool, string>> = { place: "Draw" };

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
  const scatterRotation = useEditorStore((s) => s.scatterRotation);
  const setScatterRotation = useEditorStore((s) => s.setScatterRotation);
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
  const record = useEditorStore((s) => s.record);
  const terrainBiome = useEditorStore((s) => s.terrainBiome);
  const setTerrainBiome = useEditorStore((s) => s.setTerrainBiome);
  const overlapPolicy = useEditorStore((s) => s.overlapPolicy);
  const setOverlapPolicy = useEditorStore((s) => s.setOverlapPolicy);

  const onTerrain = activeLayerId === "terrain";
  const tools = LAYER_TOOLS[activeLayerId];
  const isObjectLayer = LAYER_OBJECT[activeLayerId] !== undefined;
  const selecting = objectTool === "select";

  /**
   * A selection can now span layers (ADR-28), so what the rail offers follows the selected
   * *objects*, not the active layer: shared controls always, and the type-specific ones only
   * when every selected object is that type. A text-size slider over a mixed bag of trees
   * and labels would have to either edit nothing or lie about what it edits.
   */
  const selected = useMemo(() => {
    const ids = new Set(selection);
    return scene.layers.flatMap((layer) => layer.objects.filter((o) => ids.has(o.id)));
  }, [scene.layers, selection]);
  const onlyType =
    selected.length > 0 && selected.every((o) => o.type === selected[0].type)
      ? selected[0].type
      : undefined;
  /** Whether anything in the selection answers to the frame's handles (I9's footprint side). */
  const transformable = selected.some(hasFootprint);
  const selectedLand = selected.filter((o): o is Landmass => o.type === "landmass");

  /**
   * The palette does double duty (D6): with land selected it recolours it in one undo step,
   * with nothing selected it sets what the brush will paint next. One control, because
   * "which biome" is one question — and it is why a hand-painted continent stopped being
   * grassland-or-nothing.
   */
  const pickBiome = (biome: Biome) => {
    if (selectedLand.length === 0) {
      setTerrainBiome(biome);
      return;
    }
    const state = useEditorStore.getState();
    state.record("set biome", () => {
      for (const landmass of selectedLand) {
        state.patchObject<Landmass>("terrain", landmass.id, { biome });
      }
    });
  };
  /** The one selected label, so the size slider edits the thing rather than the default. */
  const editingLabel =
    onlyType === "label" && selected.length === 1 ? (selected[0] as Label) : undefined;

  /**
   * Restacking is per layer even for a cross-layer selection: layer order is fixed and
   * z-order lives *within* a layer (ADR-15), so each object moves inside its own stack and
   * cross-layer z never has to mean anything.
   */
  const restackSelection = (direction: 1 | -1) => {
    const state = useEditorStore.getState();
    const ids = new Set(state.selection);
    const touched = state.scene.layers.filter((l) => l.objects.some((o) => ids.has(o.id)));
    state.record(direction === 1 ? "bring forward" : "send back", () => {
      for (const layer of touched) {
        state.setLayerObjects(layer.id, restack(layer.objects, ids, direction));
      }
    });
  };

  const deleteSelection = () => {
    const state = useEditorStore.getState();
    const doomed = new Set(state.selection);
    const touched = state.scene.layers.filter((l) => l.objects.some((o) => doomed.has(o.id)));
    state.record("delete", () => {
      for (const layer of touched) {
        state.removeObjects(
          layer.id,
          layer.objects.filter((o) => doomed.has(o.id)).map((o) => o.id),
        );
      }
    });
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

      {/* The eraser is global since WP-26, so its size has to be reachable from any layer —
          including rivers, which is not an object layer and would otherwise hide the slider
          for the one tool that now works there. */}
      {(objectTool === "erase" ||
        onTerrain ||
        (isObjectLayer && objectTool !== "select" && objectTool !== "place")) && (
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

      {/*
        WP-27 — this was `jitter(5)` hardcoded in `anchorAt`, so the only way to find out how
        much a scatter turned things was to scatter some. It is a *spread*, not an angle, and
        it defaults to 0: upright is what "no rotation" should mean, and a stylised map often
        wants exactly that. The generator keeps its own (`12` D4), in the generate dialog.
      */}
      {objectTool === "scatter" && (
        <Slider
          label="Rotation jitter"
          value={scatterRotation}
          min={0}
          max={45}
          step={1}
          display={scatterRotation === 0 ? "upright" : `±${scatterRotation}°`}
          onChange={setScatterRotation}
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

      {(onTerrain || selectedLand.length > 0) && (
        <>
          <p className={panelTitle()} data-land-count={selectedLand.length}>
            {selectedLand.length > 0
              ? `${selectedLand.length} landmass${selectedLand.length === 1 ? "" : "es"}`
              : "Biome to paint"}
          </p>
          <div className={segment()}>
            {(Object.keys(BIOME_FILL) as Biome[]).map((biome) => (
              <button
                key={biome}
                type="button"
                data-biome={biome}
                className={toolButton({
                  active:
                    selectedLand.length > 0
                      ? selectedLand.every((l) => l.biome === biome)
                      : terrainBiome === biome,
                })}
                onClick={() => pickBiome(biome)}
              >
                <span
                  aria-hidden
                  className="mbf:border-line mbf:size-3 mbf:rounded-full mbf:border"
                  style={{ background: BIOME_FILL[biome] }}
                />
                {biome}
              </button>
            ))}
          </div>
          {/*
            A field, not a dialog. Unlike a label — whose whole point is *where* it sits, so
            it gets an editor on the canvas — a landmass name is metadata about the selected
            thing, which is what a properties strip is for. And WP-13's acceptance forbids
            reaching for a native text prompt again.
          */}
          {selectedLand.length === 1 && (
            <label className={field()}>
              <span className={fieldLabel()}>Name</span>
              <input
                key={selectedLand[0].id}
                data-land-name
                defaultValue={selectedLand[0].name ?? ""}
                placeholder="Unnamed"
                className="mbf:bg-sink mbf:border-line mbf:text-ink mbf:focus-visible:outline-accent mbf:w-full mbf:rounded-md mbf:border mbf:px-2 mbf:py-1 mbf:text-xs mbf:focus-visible:outline-2"
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name === (selectedLand[0].name ?? "")) return;
                  record("name landmass", () =>
                    patchObject<Landmass>("terrain", selectedLand[0].id, { name }),
                  );
                }}
              />
            </label>
          )}
        </>
      )}

      {(onTerrain || selectedLand.length > 0) && (
        <>
          <p className={panelTitle()}>On overlap</p>
          <div className={segment()}>
            {(["apart", "merge", "carve"] as const).map((policy) => (
              <button
                key={policy}
                type="button"
                data-overlap={policy}
                className={toolButton({ active: overlapPolicy === policy })}
                onClick={() => setOverlapPolicy(policy)}
              >
                {policy === "apart" ? "keep apart" : policy}
              </button>
            ))}
          </div>
          {/*
            Read at drop time, never asked as a modal: a dialog appears *after* the press,
            so the pointer could not promise the outcome (C6), and it would fire again on
            every nudge. "Carve a strait" is the third outcome and arrives with WP-17 — it
            is absent rather than disabled, because a control that does nothing is the thing
            I9 exists to prevent.
          */}
          <p className={hint()}>
            {overlapPolicy === "apart"
              ? "A drop that lands on other land slides back along the drag to where it last fit."
              : overlapPolicy === "merge"
                ? "A drop that lands on other land fuses with it — the larger piece keeps its name."
                : "A drop that lands on other land bites a channel through itself. If that would leave almost nothing, it slides back instead."}
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

      {(activeLayerId === "labels" || onlyType === "label") && (
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
              : "Select works on rivers from any layer — click the water to pick one, drag its points to reshape."}
          </p>
        </>
      )}

      {selecting && (
        <>
          {/*
            Say only what is true of what is actually selected (I4). The land-only branch
            used to offer nothing but recolour and rename, which was honest while terrain
            could not be dragged — WP-15, WP-16 and WP-20 made move, scale and rotate real
            for both path types, so every framed selection now gets the same first line and
            each type adds only what is extra about it.
          */}
          <p className={hint()}>
            {selected.length === 0
              ? "Click, shift-click or drag a marquee to select — any layer, not just this one."
              : `${selected.length} selected${onlyType ? "" : " across types"}` +
                " · drag to move · corners scale · the stalk rotates." +
                (onlyType === "river" ? " Drag a control point to reshape it." : "") +
                (selectedLand.length > 0
                  ? " Double-click land to take what stands on it too."
                  : "")}
          </p>
          {/*
            Absent, not disabled, for a land-only selection: landmasses never overlap at
            rest (`08` C1), so draw order among them cannot mean anything. A control that
            appears and does nothing is exactly what I9 exists to prevent.
          */}
          {transformable && (
            <div className={segment()}>
              <button
                type="button"
                className={button()}
                disabled={selected.length === 0}
                onClick={() => restackSelection(1)}
              >
                <ChevronsUp size={13} /> Forward
              </button>
              <button
                type="button"
                className={button()}
                disabled={selected.length === 0}
                onClick={() => restackSelection(-1)}
              >
                <ChevronsDown size={13} /> Back
              </button>
            </div>
          )}
          <button
            type="button"
            className={button({ tone: "danger", block: true })}
            disabled={selected.length === 0}
            onClick={deleteSelection}
          >
            <Trash2 size={13} /> Delete selected
          </button>
        </>
      )}
    </aside>
  );
}
