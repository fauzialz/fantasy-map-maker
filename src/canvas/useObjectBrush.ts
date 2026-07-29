import { useCallback, useEffect, useRef, useState } from "react";
import type { LayerId, Point, Scene, SceneObject } from "../scene/types";
import { variantCount } from "../sprites/registry";
import { isUnderBrush } from "./objectHit";
import { LAYER_OBJECT, useEditorStore } from "../state/editorStore";

interface Options {
  activeLayerId: LayerId;
  enabled: boolean;
  toMapPoint: (clientX: number, clientY: number) => Point;
}

const jitter = (spread: number) => (Math.random() - 0.5) * 2 * spread;

/**
 * @returns the new object, or undefined when the user backed out of naming a label —
 * placing an empty label would leave an invisible, unclickable object on the map.
 */
function makeObject(
  kind: NonNullable<(typeof LAYER_OBJECT)[LayerId]>,
  [x, y]: Point,
  scatter: boolean,
): SceneObject | undefined {
  const base = {
    id: crypto.randomUUID(),
    x,
    y,
    // Map sprites read as drawn-in-place; a few degrees keeps a range from looking stamped.
    rotation: scatter ? jitter(5) : 0,
    scale: scatter ? 1 + jitter(0.28) : 1,
    z: 0,
  };

  if (kind === "label") {
    // ponytail: a native prompt is the whole text-entry UI for now. WP-13 replaces it with
    // an inline editor on the canvas; until then this is one line and works everywhere.
    const text = window.prompt("Label text")?.trim();
    if (!text) return undefined;
    const { labelSize } = useEditorStore.getState();
    return { ...base, type: "label", text, font: "fantasy-serif", size: labelSize, pathId: null };
  }
  if (kind === "landmark") {
    return { ...base, type: "landmark", kind: useEditorStore.getState().iconKind };
  }
  return { ...base, type: kind, variant: Math.floor(Math.random() * variantCount(kind)) };
}

/**
 * The three placement modes, shared by every object layer (ADR-18: what "erase" does
 * follows the active tool — here it removes objects rather than editing land).
 *
 * - **scatter** — walk the stroke, dropping jittered objects at a spacing set by the brush
 * - **place**  — one object per click
 * - **erase**  — remove objects under the drag
 */
export function useObjectBrush({ activeLayerId, enabled, toMapPoint }: Options) {
  const [stroking, setStroking] = useState(false);
  const last = useRef<Point | null>(null);
  /** The scene as the drag began, and what to call the step it becomes on mouse-up. */
  const pending = useRef<{ scene: Scene; label: string } | null>(null);
  const kind = LAYER_OBJECT[activeLayerId];

  const scatterAt = useCallback(
    (point: Point) => {
      const { brushSize, addObjects } = useEditorStore.getState();
      if (!kind) return;
      const spread = brushSize / 2;
      const placed = makeObject(kind, [point[0] + jitter(spread), point[1] + jitter(spread)], true);
      if (placed) addObjects(activeLayerId, [placed]);
    },
    [activeLayerId, kind],
  );

  const eraseAt = useCallback(
    (point: Point) => {
      const state = useEditorStore.getState();
      const layer = state.scene.layers.find((l) => l.id === activeLayerId);
      if (!layer) return;

      // ponytail: linear scan, and deliberately still one after WP-7. The rbush index serves
      // the marquee, which tests a box against every object per drag frame; the eraser tests
      // one small disc, so at the ~1-2k budget a distance check per object costs less than
      // keeping an index in step with each removal. Revisit if the budget grows.
      const radius = state.brushSize / 2;
      const doomed = layer.objects
        .filter((object) => isUnderBrush(object, point, radius))
        .map((object) => object.id);

      if (doomed.length > 0) state.removeObjects(activeLayerId, doomed);
    },
    [activeLayerId],
  );

  const step = useCallback(
    (point: Point, first: boolean) => {
      const { objectTool, brushSize } = useEditorStore.getState();

      if (objectTool === "erase") {
        eraseAt(point);
        last.current = point;
        return;
      }
      if (objectTool === "place") {
        if (!first || !kind) return;
        const placed = makeObject(kind, point, false);
        if (placed) useEditorStore.getState().addObjects(activeLayerId, [placed]);
        return;
      }

      const spacing = Math.max(brushSize * 0.42, 12);
      if (
        first ||
        !last.current ||
        Math.hypot(point[0] - last.current[0], point[1] - last.current[1]) >= spacing
      ) {
        scatterAt(point);
        last.current = point;
      }
    },
    [activeLayerId, eraseAt, kind, scatterAt],
  );

  const begin = useCallback(
    (clientX: number, clientY: number) => {
      if (!enabled || !kind) return false;
      last.current = null;
      const { scene, objectTool } = useEditorStore.getState();
      pending.current = { scene, label: objectTool === "erase" ? "erase objects" : objectTool };
      step(toMapPoint(clientX, clientY), true);
      setStroking(true);
      return true;
    },
    [enabled, kind, step, toMapPoint],
  );

  useEffect(() => {
    if (!stroking) return;

    const move = (event: MouseEvent) => step(toMapPoint(event.clientX, event.clientY), false);
    // One drag is one action: every object dropped or erased between here and the press
    // closes as a single step, however many store writes it took.
    const stop = () => {
      const open = pending.current;
      pending.current = null;
      if (open) useEditorStore.getState().commit(open.scene, open.label);
      last.current = null;
      setStroking(false);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
    };
  }, [stroking, step, toMapPoint]);

  return { begin, stroking, kind };
}
