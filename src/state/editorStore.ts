import { create } from "zustand";
import { createEmptyScene } from "../scene/scene";
import { ICON_KINDS } from "../sprites/registry";
import type {
  CanvasPreset,
  Landmass,
  LayerId,
  Scene,
  SceneObject,
  SceneSettings,
} from "../scene/types";

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
  /** font size for the next label, in map units */
  labelSize: number;
  /** width of the next river at its mouth, in map units */
  riverWidth: number;
  /** whether the next river narrows toward its source */
  riverTaper: boolean;
  /** ids of the current multi-selection, within the active layer */
  selection: string[];
  setActiveLayer: (id: LayerId) => void;
  setBrushSize: (size: number) => void;
  setTerrainTool: (tool: "brush" | "sea") => void;
  setObjectTool: (tool: ObjectTool) => void;
  setIconKind: (kind: string) => void;
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
  /** ponytail: direct write for now — WP-9 turns this into a PaintLand/EraseSea command. */
  setLandmasses: (landmasses: Landmass[]) => void;
  newScene: (preset: CanvasPreset) => void;
}

const TERRAIN = "terrain";

export const useEditorStore = create<EditorState>((set) => ({
  scene: createEmptyScene("landscape"),
  activeLayerId: "terrain",
  brushSize: 260,
  terrainTool: "brush",
  objectTool: "scatter",
  iconKind: ICON_KINDS[0],
  labelSize: 96,
  riverWidth: 26,
  riverTaper: true,
  selection: [],

  // Selection is per-layer, so switching layers drops it rather than leaving invisible
  // objects selected on a layer you are no longer looking at. The tool comes along only
  // if the new layer offers it — otherwise a press would land on a tool with no buttons.
  setActiveLayer: (activeLayerId) =>
    set((state) => {
      const tools = LAYER_TOOLS[activeLayerId];
      return {
        activeLayerId,
        selection: [],
        objectTool: !tools || tools.includes(state.objectTool) ? state.objectTool : tools[0],
      };
    }),
  setBrushSize: (brushSize) => set({ brushSize }),
  setTerrainTool: (terrainTool) => set({ terrainTool }),
  setObjectTool: (objectTool) => set({ objectTool }),
  setIconKind: (iconKind) => set({ iconKind }),
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

  setLandmasses: (landmasses) =>
    set((state) => ({
      scene: {
        ...state.scene,
        layers: state.scene.layers.map((layer) =>
          layer.id === TERRAIN ? { ...layer, objects: landmasses } : layer,
        ),
      },
    })),

  newScene: (preset) => set({ scene: createEmptyScene(preset) }),
}));

export const selectLandmasses = (state: EditorState): Landmass[] =>
  (state.scene.layers.find((layer) => layer.id === TERRAIN)?.objects ?? []) as Landmass[];
