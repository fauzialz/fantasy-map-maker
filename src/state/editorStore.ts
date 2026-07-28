import { create } from "zustand";
import { createEmptyScene } from "../scene/scene";
import type { CanvasPreset, LayerId, Scene } from "../scene/types";

/**
 * Session state for the editor. The scene is the serialized part; everything else here
 * (active layer, and the viewport held by the stage) is session-only and never saved.
 */
interface EditorState {
  scene: Scene;
  activeLayerId: LayerId;
  setActiveLayer: (id: LayerId) => void;
  newScene: (preset: CanvasPreset) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  scene: createEmptyScene("landscape"),
  activeLayerId: "terrain",
  setActiveLayer: (activeLayerId) => set({ activeLayerId }),
  newScene: (preset) => set({ scene: createEmptyScene(preset) }),
}));
