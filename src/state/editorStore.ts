import { create } from "zustand";
import { createEmptyScene } from "../scene/scene";
import type { CanvasPreset, Landmass, LayerId, Scene, SceneSettings } from "../scene/types";

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
  setActiveLayer: (id: LayerId) => void;
  setBrushSize: (size: number) => void;
  setTerrainTool: (tool: "brush" | "sea") => void;
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

  setActiveLayer: (activeLayerId) => set({ activeLayerId }),
  setBrushSize: (brushSize) => set({ brushSize }),
  setTerrainTool: (terrainTool) => set({ terrainTool }),

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
