import { create } from "zustand";
import { createEmptyScene } from "../scene/scene";
import { restack } from "../scene/transform";
import { ICON_KINDS, type SpriteKind } from "../sprites/registry";
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
 *
 * **`select` is not in here (WP-25).** ADR-28 made Select a global mode in the toolbar,
 * acting on every visible, unlocked layer; the per-layer copies survived that change and
 * the rail went on rendering a second chip for it — a control that looks layer-scoped for
 * a mode that is not, which is exactly the model ADR-28 removed.
 *
 * **`erase` left with WP-26**, once the eraser became global (ADR-37) — the same duplication
 * Select's chip was. The table is create modes only now.
 */
export const LAYER_TOOLS: Partial<Record<LayerId, ObjectTool[]>> = {
  mountains: ["scatter", "place"],
  forests: ["scatter", "place"],
  icons: ["place"],
  labels: ["place"],
  rivers: ["place"],
};

/**
 * The modes that act on what is already on the map rather than on the active layer, so
 * they outlive a layer switch and are never in `LAYER_TOOLS`. Select since ADR-28, Erase
 * since ADR-37.
 */
export const GLOBAL_TOOLS: ObjectTool[] = ["select", "erase"];

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
  /**
   * How far the scatter brush turns each sprite, as a **spread in degrees** rather than an
   * angle: 0 leaves everything upright, 15 means ±15°. Was a hardcoded `jitter(5)` in
   * `anchorAt` (WP-27); the default is now **0**, which is what "no rotation" should mean
   * and what a stylised map usually wants.
   *
   * Deliberately *not* shared with the generator's own spread (`12` D4). They are two
   * different questions: this one is about the map you are drawing by hand, and
   * `generatorRotation` is part of a world recipe a world code has to reproduce exactly.
   */
  scatterRotation: number;
  /**
   * How big the next placed sprite is, as a **multiplier** of its kind's art height, per kind
   * (WP-33). Was hardcoded `1` in `anchorAt`, so "how big is the thing I am about to place"
   * had no control at all — the sibling of the rotation constant WP-27 replaced.
   *
   * A multiplier rather than map units on purpose: drawn height is
   * `SPRITE_HEIGHT[kind] × scale`, so an absolute knob would have to divide by the art
   * constant and would silently change meaning every time the art is retuned — which WP-28
   * did, twice, in one package.
   */
  spriteScale: Record<SpriteKind, number>;
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
  /**
   * The generator's own rotation spread, in degrees (`12` D4). Its own field rather than a
   * read of `scatterRotation`: the world code is a reproducibility contract, so every input
   * that decides a world has to travel *in the code* — a generated world must not change
   * because a brush slider moved an hour ago.
   */
  generatorRotation: number;
  /**
   * The create page asked for a world; the editor runs it on arrival and clears this
   * (`14` D7 — generation happens after the navigation, so the app appears sooner and the
   * existing toast still covers the undo).
   *
   * Session state, not a history entry or a URL parameter: a reload must **not** regenerate,
   * which is exactly the trap `14` D12 rejected `?w=` for.
   */
  generateOnOpen: boolean;
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
  setScatterRotation: (degrees: number) => void;
  setSpriteScale: (kind: SpriteKind, scale: number) => void;
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
    generatorRotation?: number;
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
  /**
   * Rename the open map. **Not undoable, deliberately** — and not by oversight: `diffScene`
   * watches layers and settings, never `meta`, so routing this through `record` would file a
   * step that carries nothing and an undo would silently do nothing. The same reasoning as
   * `setLayerFlags`: undo should reverse your last *edit*, not your last label.
   */
  setTitle: (title: string) => void;
  /** Empty this map, keeping its `meta.id`. Undoable; the UI confirms first. */
  resetCanvas: (preset: CanvasPreset) => void;
  /** A separate map with a fresh `meta.id`. Not undoable — the old one is in the gallery. */
  newMap: (preset: CanvasPreset) => void;
  /** Switch to an existing draft. Clears history, which belongs to the map that made it. */
  openScene: (scene: Scene) => void;
  /**
   * Delete whatever is selected, across every layer holding any of it, as one step.
   *
   * Lifted here by WP-32 because it had **three** copies — the rail's button, the Delete key,
   * and now the Edit menu — each already reaching for `getState()` in its own body. They were
   * store actions wearing a component's clothes.
   */
  deleteSelection: () => void;
  /**
   * Restacking is per layer even for a cross-layer selection: layer order is fixed and z-order
   * lives *within* a layer (ADR-15), so each object moves inside its own stack and cross-layer
   * z never has to mean anything.
   */
  restackSelection: (direction: 1 | -1) => void;
}

const TERRAIN = "terrain";

/**
 * The layers holding any of these ids — every write that touches a cross-layer selection walks
 * exactly this list. Lived in `useSelection` until WP-32 gave the store two callers of its own.
 */
export const layersHolding = (layers: Scene["layers"], ids: Set<string>) =>
  layers.filter((layer) => layer.objects.some((object) => ids.has(object.id)));

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
  scatterRotation: 0,
  spriteScale: { mountain: 1, tree: 1, landmark: 1 },
  labelSize: 96,
  riverWidth: 26,
  riverTaper: true,
  selection: [],
  seaLevel: null,
  generatorRotation: 5,
  mountainDensity: 0.5,
  forestDensity: 0.5,
  generateOnOpen: false,
  past: [],
  future: [],

  /**
   * Switching layers changes what a press *creates*, and nothing else (ADR-28).
   *
   * The selection survives, because it is no longer per-layer — dropping it here would
   * throw away a cross-layer selection the moment you reached for another tool. And the
   * **global modes** survive too, on any layer including terrain: they are modes, not
   * capabilities the layer grants. Any other tool still falls back to one the new layer
   * offers, or a press would land on a tool with no buttons behind it.
   */
  setActiveLayer: (activeLayerId) =>
    set((state) => {
      const tools = LAYER_TOOLS[activeLayerId];
      const keep =
        GLOBAL_TOOLS.includes(state.objectTool) || !tools || tools.includes(state.objectTool);
      return { activeLayerId, objectTool: keep ? state.objectTool : tools[0] };
    }),
  setBrushSize: (brushSize) => set({ brushSize }),
  setTerrainTool: (terrainTool) => set({ terrainTool }),
  setObjectTool: (objectTool) => set({ objectTool }),
  setIconKind: (iconKind) => set({ iconKind }),
  setTerrainBiome: (terrainBiome) => set({ terrainBiome }),
  setOverlapPolicy: (overlapPolicy) => set({ overlapPolicy }),
  setScatterRotation: (scatterRotation) => set({ scatterRotation }),
  setSpriteScale: (kind, scale) =>
    set((state) => ({ spriteScale: { ...state.spriteScale, [kind]: scale } })),
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

  setTitle: (title) =>
    set((state) => ({
      scene: { ...state.scene, meta: { ...state.scene.meta, title } },
    })),

  /**
   * Empty **this** map out, keeping its identity (WP-22).
   *
   * Undoable as a whole-scene step, because the preset changes `meta` too and per-object
   * diffs don't carry that. `meta.id` and `createdAt` survive deliberately: reset means
   * "clear the map I am on", so it must write back over the same draft rather than leave
   * the old one stranded under its old key — which is precisely what the single `newScene`
   * this replaced did on every click.
   */
  resetCanvas: (preset) =>
    set((state) => {
      const fresh = createEmptyScene(preset, state.scene.meta.title);
      const scene: Scene = {
        ...fresh,
        meta: {
          ...fresh.meta,
          id: state.scene.meta.id,
          createdAt: state.scene.meta.createdAt,
        },
      };
      return {
        scene,
        selection: [],
        past: pushStep(state.past, {
          label: `reset ${preset} canvas`,
          layers: [],
          scene: { before: state.scene, after: scene },
        }),
        future: [],
      };
    }),

  /**
   * A second map, alongside the first (WP-22).
   *
   * **Not undoable, and it clears the stack.** Nothing is lost — the previous map keeps its
   * own draft and is one click away in the gallery — so there is no destruction to reverse.
   * The history has to go because a step holds scenes belonging to the map that produced
   * them: undoing across a switch would drop the *other* map's geometry into this one while
   * the remembered-open id still points here. Undo history is session state and per-map
   * (data model §7).
   */
  openScene: (scene) => set({ scene, selection: [], past: [], future: [] }),

  newMap: (preset) => set({ scene: createEmptyScene(preset), selection: [], past: [], future: [] }),

  deleteSelection: () => {
    const state = get();
    if (state.selection.length === 0) return;
    const doomed = new Set(state.selection);
    state.record("delete", () => {
      for (const layer of layersHolding(get().scene.layers, doomed)) {
        get().removeObjects(
          layer.id,
          layer.objects.filter((object) => doomed.has(object.id)).map((object) => object.id),
        );
      }
    });
  },

  restackSelection: (direction) => {
    const state = get();
    if (state.selection.length === 0) return;
    const ids = new Set(state.selection);
    state.record(direction === 1 ? "bring forward" : "send back", () => {
      for (const layer of layersHolding(get().scene.layers, ids)) {
        get().setLayerObjects(layer.id, restack(layer.objects, ids, direction));
      }
    });
  },
}));

export const selectLandmasses = (state: EditorState): Landmass[] =>
  (state.scene.layers.find((layer) => layer.id === TERRAIN)?.objects ?? []) as Landmass[];
