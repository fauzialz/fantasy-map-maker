import { create } from "zustand";
import { createEmptyScene } from "../scene/scene";
import type {
  CanvasPreset,
  Landmass,
  LayerId,
  Scene,
  SceneObject,
  SceneSettings,
} from "../scene/types";

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
  objectTool: "scatter" | "place" | "erase";
  setActiveLayer: (id: LayerId) => void;
  setBrushSize: (size: number) => void;
  setTerrainTool: (tool: "brush" | "sea") => void;
  setObjectTool: (tool: "scatter" | "place" | "erase") => void;
  addObjects: (layerId: LayerId, objects: SceneObject[]) => void;
  removeObjects: (layerId: LayerId, ids: string[]) => void;
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

  setActiveLayer: (activeLayerId) => set({ activeLayerId }),
  setBrushSize: (brushSize) => set({ brushSize }),
  setTerrainTool: (terrainTool) => set({ terrainTool }),
  setObjectTool: (objectTool) => set({ objectTool }),

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
