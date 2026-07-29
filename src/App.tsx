import { useEffect, useState } from "react";
import { MapStage } from "./canvas/MapStage";
import { Toasts } from "./ui/Toasts";
import { callGeometry } from "./engine/worker/client";
import { restack } from "./scene/transform";
import { ICON_KINDS } from "./sprites/registry";
import type { CanvasPreset, Label, LayerId, WorldType } from "./scene/types";
import { LAYER_OBJECT, LAYER_TOOLS, useEditorStore, type ObjectTool } from "./state/editorStore";
import { useToastStore } from "./state/toastStore";
import "./App.css";

const PRESETS: CanvasPreset[] = ["landscape", "square", "portrait"];
const WORLD_TYPES: WorldType[] = ["single", "archipelago", "multiple"];

/** "place" means something different with a spline in your hand than with a stamp. */
const TOOL_LABEL: Partial<Record<LayerId, Partial<Record<ObjectTool, string>>>> = {
  rivers: { select: "edit", place: "draw" },
};

// ponytail: this rail is a stand-in for the WP-13 toolbar/layer panel. It exists so the
// active layer can be switched — the only interaction WP-1 has to prove.
export default function App() {
  const scene = useEditorStore((s) => s.scene);
  const activeLayerId = useEditorStore((s) => s.activeLayerId);
  const setActiveLayer = useEditorStore((s) => s.setActiveLayer);
  const newScene = useEditorStore((s) => s.newScene);
  const brushSize = useEditorStore((s) => s.brushSize);
  const setBrushSize = useEditorStore((s) => s.setBrushSize);
  const setSettings = useEditorStore((s) => s.setSettings);
  const terrainTool = useEditorStore((s) => s.terrainTool);
  const setTerrainTool = useEditorStore((s) => s.setTerrainTool);
  const objectTool = useEditorStore((s) => s.objectTool);
  const setObjectTool = useEditorStore((s) => s.setObjectTool);
  const objectLayer = LAYER_OBJECT[activeLayerId];
  const layerTools = LAYER_TOOLS[activeLayerId];
  const selection = useEditorStore((s) => s.selection);
  const iconKind = useEditorStore((s) => s.iconKind);
  const setIconKind = useEditorStore((s) => s.setIconKind);
  const labelSize = useEditorStore((s) => s.labelSize);
  const setLabelSize = useEditorStore((s) => s.setLabelSize);
  const riverWidth = useEditorStore((s) => s.riverWidth);
  const setRiverWidth = useEditorStore((s) => s.setRiverWidth);
  const riverTaper = useEditorStore((s) => s.riverTaper);
  const setRiverTaper = useEditorStore((s) => s.setRiverTaper);
  const patchObject = useEditorStore((s) => s.patchObject);
  const record = useEditorStore((s) => s.record);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const past = useEditorStore((s) => s.past);
  const future = useEditorStore((s) => s.future);

  /**
   * The one selected label, if that is what is selected — the size slider and the text
   * button edit it directly, so they read as properties of the thing rather than defaults.
   */
  const editingLabel =
    activeLayerId === "labels" && selection.length === 1
      ? (scene.layers
          .find((l) => l.id === "labels")
          ?.objects.find((o) => o.id === selection[0] && o.type === "label") as Label | undefined)
      : undefined;

  /** Restacking lives in the store so the rail and the canvas agree on what is selected. */
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
  const generator = useEditorStore((s) => s.scene.generator);
  const setGenerator = useEditorStore((s) => s.setGenerator);
  const seaLevel = useEditorStore((s) => s.seaLevel);
  const mountainDensity = useEditorStore((s) => s.mountainDensity);
  const forestDensity = useEditorStore((s) => s.forestDensity);
  const setAdvanced = useEditorStore((s) => s.setAdvanced);
  const [worker, setWorker] = useState("checking…");
  const [generating, setGenerating] = useState(false);

  /**
   * 10h — generate the world in the worker, then apply the whole replace as one command.
   * Rings need no special handling: they are derived from the landmasses, so they follow.
   */
  const generate = async () => {
    const state = useEditorStore.getState();
    const populated = state.scene.layers.some((layer) => layer.objects.length > 0);
    // ponytail: window.confirm is the confirm modal until WP-13 brings in Radix. One line,
    // and it cannot drift out of step with what it is guarding.
    if (
      populated &&
      !window.confirm("Generate a new world? This replaces everything on the canvas.")
    )
      return;

    setGenerating(true);
    try {
      const result = await callGeometry("generate", {
        canvas: { w: state.scene.meta.canvas.w, h: state.scene.meta.canvas.h },
        ...state.scene.generator,
        seaLevel: state.seaLevel,
        mountainDensity: state.mountainDensity,
        forestDensity: state.forestDensity,
        coastDetail: state.scene.settings.coastDetail,
      });
      useEditorStore.getState().applyGenerated(result);
      useToastStore
        .getState()
        .show(
          `Generated ${result.landmasses.length} landmasses, ${result.mountains.length} mountains, ${result.trees.length} trees`,
          () => useEditorStore.getState().undo(),
        );
    } catch (err) {
      useToastStore.getState().show(`Generate failed: ${(err as Error).message}`);
    } finally {
      setGenerating(false);
    }
  };

  // Undo has to answer wherever the pointer is, so it lives above the per-tool key handlers
  // rather than in any one of them.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [redo, undo]);

  useEffect(() => {
    callGeometry("ping", { echo: "ok" })
      .then((r) => setWorker(`worker: ${r.echo}`))
      .catch((err: Error) => setWorker(`worker failed: ${err.message}`));
  }, []);

  return (
    <main>
      <aside className="rail">
        <h1>map.byfauzi.com</h1>

        <div className="tools">
          <button type="button" disabled={past.length === 0} onClick={undo}>
            Undo{past.length > 0 && ` · ${past[past.length - 1].label}`}
          </button>
          <button type="button" disabled={future.length === 0} onClick={redo}>
            Redo{future.length > 0 && ` · ${future[future.length - 1].label}`}
          </button>
        </div>

        <h2>Layers</h2>
        <ul className="layers">
          {[...scene.layers].reverse().map((layer) => (
            <li key={layer.id}>
              <button
                type="button"
                className={layer.id === activeLayerId ? "active" : undefined}
                onClick={() => setActiveLayer(layer.id)}
              >
                {layer.id}
                <span>{layer.id === activeLayerId ? "live" : "cached"}</span>
              </button>
            </li>
          ))}
        </ul>

        {activeLayerId === "terrain" && (
          <>
            <h2>Terrain</h2>
            <div className="tools">
              <button
                type="button"
                className={terrainTool === "brush" ? "active" : undefined}
                onClick={() => setTerrainTool("brush")}
              >
                Land brush
              </button>
              <button
                type="button"
                className={terrainTool === "sea" ? "active" : undefined}
                onClick={() => setTerrainTool("sea")}
              >
                Sea brush
              </button>
            </div>

            <label className="slider">
              Brush size <b>{brushSize}</b>
              <input
                type="range"
                min={40}
                max={800}
                step={10}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
              />
            </label>
            <label className="slider">
              Coast detail <b>{scene.settings.coastDetail.toFixed(2)}</b>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={scene.settings.coastDetail}
                onChange={(e) =>
                  record(
                    "coast detail",
                    () => setSettings({ coastDetail: Number(e.target.value) }),
                    true,
                  )
                }
              />
            </label>
          </>
        )}

        {layerTools && (
          <>
            <h2>{activeLayerId}</h2>
            <div className="tools">
              {layerTools.map((tool) => (
                <button
                  key={tool}
                  type="button"
                  className={objectTool === tool ? "active" : undefined}
                  onClick={() => setObjectTool(tool)}
                >
                  {TOOL_LABEL[activeLayerId]?.[tool] ?? tool}
                </button>
              ))}
            </div>

            {activeLayerId === "icons" && objectTool === "place" && (
              <div className="palette">
                {ICON_KINDS.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className={iconKind === kind ? "active" : undefined}
                    onClick={() => setIconKind(kind)}
                  >
                    {kind}
                  </button>
                ))}
              </div>
            )}

            {activeLayerId === "labels" && (
              <>
                <label className="slider">
                  Text size <b>{editingLabel?.size ?? labelSize}</b>
                  <input
                    type="range"
                    min={24}
                    max={220}
                    step={4}
                    value={editingLabel?.size ?? labelSize}
                    onChange={(e) => {
                      const size = Number(e.target.value);
                      if (editingLabel)
                        record(
                          "resize label",
                          () => patchObject<Label>("labels", editingLabel.id, { size }),
                          true,
                        );
                      else setLabelSize(size);
                    }}
                  />
                </label>
                <div className="tools">
                  <button
                    type="button"
                    disabled={!editingLabel}
                    onClick={() => {
                      if (!editingLabel) return;
                      const text = window.prompt("Label text", editingLabel.text)?.trim();
                      if (text)
                        record("edit label", () =>
                          patchObject<Label>("labels", editingLabel.id, { text }),
                        );
                    }}
                  >
                    Edit text
                  </button>
                </div>
              </>
            )}

            {activeLayerId === "rivers" && (
              <>
                <label className="slider">
                  River width <b>{riverWidth}</b>
                  <input
                    type="range"
                    min={6}
                    max={90}
                    step={2}
                    value={riverWidth}
                    onChange={(e) => setRiverWidth(Number(e.target.value))}
                  />
                </label>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={riverTaper}
                    onChange={(e) => setRiverTaper(e.target.checked)}
                  />
                  Widen toward the mouth
                </label>
                <p className="status">
                  {objectTool === "place"
                    ? "click from source to sea · double-click or Enter finishes · Escape cancels"
                    : "click a river to select · drag its points to reshape · Delete removes"}
                </p>
              </>
            )}

            {objectLayer && objectTool === "select" && (
              <>
                <p className="status">
                  {selection.length === 0
                    ? "click, shift-click or drag a marquee to select"
                    : `${selection.length} selected · drag to move · corners scale · stalk rotates · Delete removes`}
                </p>
                <div className="tools">
                  <button
                    type="button"
                    disabled={selection.length === 0}
                    onClick={() => restackSelection(1)}
                  >
                    Bring forward
                  </button>
                  <button
                    type="button"
                    disabled={selection.length === 0}
                    onClick={() => restackSelection(-1)}
                  >
                    Send back
                  </button>
                </div>
              </>
            )}

            {objectLayer && objectTool !== "select" && objectTool !== "place" && (
              <label className="slider">
                Brush size <b>{brushSize}</b>
                <input
                  type="range"
                  min={40}
                  max={800}
                  step={10}
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                />
              </label>
            )}
          </>
        )}

        <h2>Paper</h2>
        <label className="toggle">
          <input
            type="checkbox"
            checked={scene.settings.parchment}
            onChange={(e) =>
              record("parchment", () => setSettings({ parchment: e.target.checked }))
            }
          />
          Parchment texture
        </label>

        <h2>Coastal rings</h2>
        <label className="toggle">
          <input
            type="checkbox"
            checked={scene.settings.coastalRings}
            onChange={(e) =>
              record("show rings", () => setSettings({ coastalRings: e.target.checked }))
            }
          />
          Show rings
        </label>
        <label className="slider">
          Ring count <b>{scene.settings.ringCount}</b>
          <input
            type="range"
            min={1}
            max={8}
            step={1}
            value={scene.settings.ringCount}
            disabled={!scene.settings.coastalRings}
            onChange={(e) =>
              record("ring count", () => setSettings({ ringCount: Number(e.target.value) }), true)
            }
          />
        </label>
        <label className="slider">
          Ring gap <b>{scene.settings.ringGap}</b>
          <input
            type="range"
            min={4}
            max={60}
            step={2}
            value={scene.settings.ringGap}
            disabled={!scene.settings.coastalRings}
            onChange={(e) =>
              record("ring gap", () => setSettings({ ringGap: Number(e.target.value) }), true)
            }
          />
        </label>

        <h2>Generator</h2>
        <label className="slider">
          Land amount <b>{generator.landAmount.toFixed(2)}</b>
          <input
            type="range"
            min={0.1}
            max={0.9}
            step={0.05}
            value={generator.landAmount}
            onChange={(e) => setGenerator({ landAmount: Number(e.target.value) })}
          />
        </label>
        <label className="slider">
          Roughness <b>{generator.roughness.toFixed(2)}</b>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={generator.roughness}
            onChange={(e) => setGenerator({ roughness: Number(e.target.value) })}
          />
        </label>
        <div className="tools">
          {WORLD_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={generator.worldType === type ? "active" : undefined}
              onClick={() => setGenerator({ worldType: type })}
            >
              {type}
            </button>
          ))}
        </div>

        <details className="advanced">
          <summary>Advanced</summary>
          <label className="toggle">
            <input
              type="checkbox"
              checked={seaLevel !== null}
              onChange={(e) => setAdvanced({ seaLevel: e.target.checked ? 0.5 : null })}
            />
            Set sea level by hand
          </label>
          <label className="slider">
            Sea level <b>{seaLevel === null ? "from land amount" : seaLevel.toFixed(2)}</b>
            <input
              type="range"
              min={0.05}
              max={0.95}
              step={0.05}
              value={seaLevel ?? 0.5}
              disabled={seaLevel === null}
              onChange={(e) => setAdvanced({ seaLevel: Number(e.target.value) })}
            />
          </label>
          <label className="slider">
            Mountain density <b>{mountainDensity.toFixed(2)}</b>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={mountainDensity}
              onChange={(e) => setAdvanced({ mountainDensity: Number(e.target.value) })}
            />
          </label>
          <label className="slider">
            Forest density <b>{forestDensity.toFixed(2)}</b>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={forestDensity}
              onChange={(e) => setAdvanced({ forestDensity: Number(e.target.value) })}
            />
          </label>
        </details>

        <div className="tools">
          <button type="button" onClick={generate} disabled={generating}>
            {generating ? "Generating…" : "Generate world"}
          </button>
          <button
            type="button"
            disabled={generating}
            onClick={() => setGenerator({ seed: Math.floor(Math.random() * 1e9) })}
          >
            Re-roll
          </button>
        </div>
        <p className="status">seed {generator.seed}</p>

        <h2>Canvas</h2>
        <div className="presets">
          {PRESETS.map((p) => (
            <label key={p}>
              <input
                type="radio"
                name="preset"
                checked={scene.meta.canvas.preset === p}
                onChange={() => newScene(p)}
              />
              {p}
            </label>
          ))}
        </div>

        <p className="status">
          {scene.meta.canvas.w}×{scene.meta.canvas.h} · schema v{scene.schemaVersion} · {worker}
        </p>
        <p className="status">
          drag to paint or erase land (terrain layer) · wheel to zoom · middle-drag or space+drag to
          pan
        </p>
      </aside>

      <MapStage />
      <Toasts />
    </main>
  );
}
