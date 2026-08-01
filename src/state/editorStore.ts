import { create } from "zustand";
import { createEmptyScene } from "../scene/scene";
import { ICON_KINDS } from "../sprites/registry";
import type { GenerateResult } from "../engine/generator/generate";
import type { OverlapPolicy } from "../engine/terrain/overlap";
import type {
  Biome,
  CanvasPreset,
  GeneratorMeta,
  Landmass,
  LayerId,
  Scene,
  SceneObject,
  SceneSettings,
} from "../scene/types";
import { applyStep, coalesce, diffScene, pushStep, type Step } from "./history";

export type ObjectTool = "select" | "scatter" | "place" | "erase";

/** Which object type each layer creates. Layers absent from this map are not object layers. */
export const LAYER_OBJECT: Partial<Record<LayerId, "mountain" | "tree" | "landmark" | "label">> = {
  mountains: "mountain",
  forests: "tree",
  icons: "landmark",
  labels: "label",
};

/**
 * Which tools each layer offers. Scattering suits the types that come in ranges and
 * forests — nobody wants a hundred jittered castles, and a scattered label is nonsense.
 * Rivers are absent because they are drawn point-by-point by their own tool, not brushed.
 */
export const LAYER_TOOLS: Partial<Record<LayerId, ObjectTool[]>> = {
  mountains: ["select", "scatter", "place", "erase"],
  forests: ["select", "scatter", "place", "erase"],
  icons: ["select", "place", "erase"],
  labels: ["select", "place"],
  rivers: ["select", "place"],
};

/**
 * Session state for the editor. The scene is the serialized part; everything else here
 * (active layer, brush size, and the viewport held by the stage) is session-only and
 * never saved.
 */
interface EditorState {
  scene: Scene;
  activeLayerId: LayerId;
  /** brush diameter in map units */
  brushSize: number;
  /**
   * ADR-18: the eraser is contextual to the active tool. On the terrain layer, erasing
   * IS the sea brush — one water tool, no mode confusion (ADR-11).
   */
  terrainTool: "brush" | "sea";
  /** Placement mode on object layers; "erase" is the contextual object eraser (ADR-18). */
  objectTool: ObjectTool;
  /** which icon the palette will place next */
  iconKind: string;
  /** biome the terrain brush paints (D6). Session state — the scene stores it per landmass. */
  terrainBiome: Biome;
  /**
   * What a dragged landmass does when it lands on another (ADR-25, D3). Read at *drop*
   * time, never asked as a modal: a dialog appears after the press, so the pointer could
   * not promise the outcome (C6), and it would repeat for every nudge.
   *
   * Default "apart" because a default is what happens when nobody chose, so it has to be
   * the outcome that cannot lose work — merge fuses two objects into one and an id
   * disappears, while sliding back changes only a position.
   */
  overlapPolicy: OverlapPolicy;
  /** font size for the next label, in map units */
  labelSize: number;
  /** width of the next river at its mouth, in map units */
  riverWidth: number;
  /** whether the next river narrows toward its source */
  riverTaper: boolean;
  /** ids of the current multi-selection, within the active layer */
  selection: string[];
  /**
   * The generator's advanced drawer. Session-only, unlike `scene.generator`: the data model
   * (§1) lists seed / landAmount / roughness / worldType and nothing else, and the schema is
   * a hard contract — new persisted fields would mean a schemaVersion bump and a migration.
   */
  seaLevel: number | null;
  mountainDensity: number;
  forestDensity: number;
  /** undo stack, oldest first; the last entry is what `undo()` reverses */
  past: Step[];
  /** steps undone and still redoable, cleared by the next edit */
  future: Step[];
  setActiveLayer: (id: LayerId) => void;
  setBrushSize: (size: number) => void;
  setTerrainTool: (tool: "brush" | "sea") => void;
  setObjectTool: (tool: ObjectTool) => void;
  setIconKind: (kind: string) => void;
  setTerrainBiome: (biome: Biome) => void;
  setOverlapPolicy: (policy: OverlapPolicy) => void;
  setLabelSize: (size: number) => void;
  setRiverWidth: (width: number) => void;
  setRiverTaper: (taper: boolean) => void;
  setSelection: (ids: string[]) => void;
  setLayerObjects: (layerId: LayerId, objects: SceneObject[]) => void;
  addObjects: (layerId: LayerId, objects: SceneObject[]) => void;
  removeObjects: (layerId: LayerId, ids: string[]) => void;
  /** Replace one object in place — a dragged river point, an edited label. */
  patchObject: <T extends SceneObject>(layerId: LayerId, id: string, patch: Partial<T>) => void;
  setSettings: (patch: Partial<SceneSettings>) => void;
  /**
   * Layer visibility and lock. Not undoable, deliberately: `diffScene` watches objects and
   * settings, and hiding a layer changes what you are looking at rather than what the map
   * is. Undo after a hide should reverse your last *edit*, not un-hide.
   */
  setLayerFlags: (layerId: LayerId, patch: { visible?: boolean; locked?: boolean }) => void;
  setLandmasses: (landmasses: Landmass[]) => void;
  /**
   * Close one undo step: everything that changed between `before` and the scene as it
   * stands now. Gestures capture `before` at pointerdown and commit at pointerup, which is
   * what makes a whole stroke, scatter-drag or transform exactly one step (ADR-22).
   *
   * `merge` folds the step into the one below when it has the same label and target — for
   * sliders, which fire an event per pixel.
   */
  setGenerator: (patch: Partial<GeneratorMeta>) => void;
  setAdvanced: (patch: {
    seaLevel?: number | null;
    mountainDensity?: number;
    forestDensity?: number;
  }) => void;
  /**
   * 10h — the generated world replaces the canvas as **one** undoable command, carrying the
   * entire previous scene so it is reversible even past the confirm (system design §13).
   */
  applyGenerated: (result: GenerateResult) => void;
  commit: (before: Scene, label: string, merge?: boolean) => void;
  /** `commit` around a single synchronous change — a click, a keypress, a toggle. */
  record: (label: string, change: () => void, merge?: boolean) => void;
  undo: () => void;
  redo: () => void;
  newScene: (preset: CanvasPreset) => void;
}

const TERRAIN = "terrain";

/** Undo can delete what is selected; a selection of ghosts would draw a frame on nothing. */
const survivors = (scene: Scene, layerId: LayerId, selection: string[]): string[] => {
  const ids = new Set(scene.layers.find((layer) => layer.id === layerId)?.objects.map((o) => o.id));
  return selection.filter((id) => ids.has(id));
};

export const useEditorStore = create<EditorState>((set, get) => ({
  scene: createEmptyScene("landscape"),
  activeLayerId: "terrain",
  brushSize: 260,
  terrainTool: "brush",
  objectTool: "scatter",
  iconKind: ICON_KINDS[0],
  terrainBiome: "grassland",
  overlapPolicy: "apart",
  labelSize: 96,
  riverWidth: 26,
  riverTaper: true,
  selection: [],
  seaLevel: null,
  mountainDensity: 0.5,
  forestDensity: 0.5,
  past: [],
  future: [],

  /**
   * Switching layers changes what a press *creates*, and nothing else (ADR-28).
   *
   * The selection survives, because it is no longer per-layer — dropping it here would
   * throw away a cross-layer selection the moment you reached for another tool. And
   * `select` survives too, on any layer including terrain: it is a mode, not a capability
   * the layer grants. Any other tool still falls back to one the new layer offers, or a
   * press would land on a tool with no buttons behind it.
   */
  setActiveLayer: (activeLayerId) =>
    set((state) => {
      const tools = LAYER_TOOLS[activeLayerId];
      const keep = state.objectTool === "select" || !tools || tools.includes(state.objectTool);
      return { activeLayerId, objectTool: keep ? state.objectTool : tools[0] };
    }),
  setBrushSize: (brushSize) => set({ brushSize }),
  setTerrainTool: (terrainTool) => set({ terrainTool }),
  setObjectTool: (objectTool) => set({ objectTool }),
  setIconKind: (iconKind) => set({ iconKind }),
  setTerrainBiome: (terrainBiome) => set({ terrainBiome }),
  setOverlapPolicy: (overlapPolicy) => set({ overlapPolicy }),
  setLabelSize: (labelSize) => set({ labelSize }),
  setRiverWidth: (riverWidth) => set({ riverWidth }),
  setRiverTaper: (riverTaper) => set({ riverTaper }),
  setSelection: (selection) => set({ selection }),

  setLayerObjects: (layerId, objects) =>
    set((state) => ({
      scene: {
        ...state.scene,
        layers: state.scene.layers.map((layer) =>
          layer.id === layerId ? { ...layer, objects } : layer,
        ),
      },
    })),

  addObjects: (layerId, objects) =>
    set((state) => ({
      scene: {
        ...state.scene,
        layers: state.scene.layers.map((layer) =>
          layer.id === layerId ? { ...layer, objects: [...layer.objects, ...objects] } : layer,
        ),
      },
    })),

  removeObjects: (layerId, ids) =>
    set((state) => {
      const doomed = new Set(ids);
      return {
        selection: state.selection.filter((id) => !doomed.has(id)),
        scene: {
          ...state.scene,
          layers: state.scene.layers.map((layer) =>
            layer.id === layerId
              ? { ...layer, objects: layer.objects.filter((object) => !doomed.has(object.id)) }
              : layer,
          ),
        },
      };
    }),

  patchObject: (layerId, id, patch) =>
    set((state) => ({
      scene: {
        ...state.scene,
        layers: state.scene.layers.map((layer) =>
          layer.id === layerId
            ? {
                ...layer,
                objects: layer.objects.map((object) =>
                  object.id === id ? ({ ...object, ...patch } as SceneObject) : object,
                ),
              }
            : layer,
        ),
      },
    })),

  setSettings: (patch) =>
    set((state) => ({
      scene: { ...state.scene, settings: { ...state.scene.settings, ...patch } },
    })),

  setLayerFlags: (layerId, patch) =>
    set((state) => ({
      scene: {
        ...state.scene,
        layers: state.scene.layers.map((layer) =>
          layer.id === layerId ? { ...layer, ...patch } : layer,
        ),
      },
    })),

  setLandmasses: (landmasses) =>
    set((state) => ({
      scene: {
        ...state.scene,
        layers: state.scene.layers.map((layer) =>
          layer.id === TERRAIN ? { ...layer, objects: landmasses } : layer,
        ),
      },
    })),

  // Generator knobs live in the scene but outside the undo diff (which watches layers and
  // settings): fiddling with a seed is not an edit, generating is.
  setGenerator: (patch) =>
    set((state) => ({
      scene: { ...state.scene, generator: { ...state.scene.generator, ...patch } },
    })),

  setAdvanced: (patch) => set(patch),

  applyGenerated: (result) =>
    set((state) => {
      const objects: Partial<Record<LayerId, SceneObject[]>> = {
        terrain: result.landmasses,
        mountains: result.mountains,
        forests: result.trees,
      };
      // Generate replaces the canvas (ADR-21): layers it does not populate are emptied, not
      // left holding icons and labels that belonged to a map that no longer exists.
      const scene: Scene = {
        ...state.scene,
        meta: { ...state.scene.meta, updatedAt: new Date().toISOString() },
        layers: state.scene.layers.map((layer) => ({ ...layer, objects: objects[layer.id] ?? [] })),
      };

      return {
        scene,
        selection: [],
        past: pushStep(state.past, {
          label: "generate",
          layers: [],
          scene: { before: state.scene, after: scene },
        }),
        future: [],
      };
    }),

  commit: (before, label, merge = false) =>
    set((state) => {
      const step = diffScene(before, state.scene, label);
      if (!step) return {};
      const below = state.past[state.past.length - 1];
      const folded = merge && below ? coalesce(below, step) : null;
      return {
        past: folded ? [...state.past.slice(0, -1), folded] : pushStep(state.past, step),
        future: [],
      };
    }),

  record: (label, change, merge) => {
    const before = get().scene;
    change();
    get().commit(before, label, merge);
  },

  undo: () =>
    set((state) => {
      const step = state.past[state.past.length - 1];
      if (!step) return {};
      const scene = applyStep(state.scene, step, "undo");
      return {
        scene,
        past: state.past.slice(0, -1),
        future: [...state.future, step],
        selection: survivors(scene, state.activeLayerId, state.selection),
      };
    }),

  redo: () =>
    set((state) => {
      const step = state.future[state.future.length - 1];
      if (!step) return {};
      const scene = applyStep(state.scene, step, "redo");
      return {
        scene,
        past: pushStep(state.past, step),
        future: state.future.slice(0, -1),
        selection: survivors(scene, state.activeLayerId, state.selection),
      };
    }),

  // A new canvas throws away everything painted so far, so it is undoable — as a whole-scene
  // step, because the preset changes `meta` too, which per-object diffs don't carry.
  newScene: (preset) =>
    set((state) => {
      const scene = createEmptyScene(preset);
      return {
        scene,
        selection: [],
        past: pushStep(state.past, {
          label: `new ${preset} canvas`,
          layers: [],
          scene: { before: state.scene, after: scene },
        }),
        future: [],
      };
    }),
}));

export const selectLandmasses = (state: EditorState): Landmass[] =>
  (state.scene.layers.find((layer) => layer.id === TERRAIN)?.objects ?? []) as Landmass[];
