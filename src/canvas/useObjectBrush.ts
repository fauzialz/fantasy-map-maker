import { useCallback, useEffect, useRef, useState } from "react";
import type { Label, LayerId, Point, Scene, SceneObject } from "../scene/types";
import { variantCount } from "../sprites/registry";
import { isUnderBrush } from "./objectHit";
import { LAYER_OBJECT, useEditorStore } from "../state/editorStore";

interface Options {
  activeLayerId: LayerId;
  enabled: boolean;
  toMapPoint: (clientX: number, clientY: number) => Point;
  /**
   * Labels are the one type that cannot be placed by the pointer alone — they need their
   * text first. The brush hands the point up and the stage opens its inline editor there.
   */
  onPlaceLabel: (at: Point) => void;
}

const jitter = (spread: number) => (Math.random() - 0.5) * 2 * spread;

const anchorAt = ([x, y]: Point, scatter: boolean) => ({
  id: crypto.randomUUID(),
  x,
  y,
  // Map sprites read as drawn-in-place; a few degrees keeps a range from looking stamped.
  rotation: scatter ? jitter(5) : 0,
  scale: scatter ? 1 + jitter(0.28) : 1,
  z: 0,
});

/** Everything the pointer can place on its own — labels go through `createLabel`. */
function makeObject(
  kind: Exclude<NonNullable<(typeof LAYER_OBJECT)[LayerId]>, "label">,
  point: Point,
  scatter: boolean,
): SceneObject {
  const base = anchorAt(point, scatter);
  if (kind === "landmark") {
    return { ...base, type: "landmark", kind: useEditorStore.getState().iconKind };
  }
  return { ...base, type: kind, variant: Math.floor(Math.random() * variantCount(kind)) };
}

/** Built once the inline editor has a name for it (`ui/LabelEditor.tsx`). */
export const createLabel = (point: Point, text: string): Label => ({
  ...anchorAt(point, false),
  type: "label",
  text,
  font: "fantasy-serif",
  size: useEditorStore.getState().labelSize,
  pathId: null,
});

/**
 * The three placement modes, shared by every object layer (ADR-18: what "erase" does
 * follows the active tool — here it removes objects rather than editing land).
 *
 * - **scatter** — walk the stroke, dropping jittered objects at a spacing set by the brush
 * - **place**  — one object per click
 * - **erase**  — remove objects under the drag
 */
export function useObjectBrush({ activeLayerId, enabled, toMapPoint, onPlaceLabel }: Options) {
  const [stroking, setStroking] = useState(false);
  const last = useRef<Point | null>(null);
  /** The scene as the drag began, and what to call the step it becomes on mouse-up. */
  const pending = useRef<{ scene: Scene; label: string } | null>(null);
  const kind = LAYER_OBJECT[activeLayerId];

  const scatterAt = useCallback(
    (point: Point) => {
      const { brushSize, addObjects } = useEditorStore.getState();
      if (!kind || kind === "label") return;
      const spread = brushSize / 2;
      const placed = makeObject(kind, [point[0] + jitter(spread), point[1] + jitter(spread)], true);
      addObjects(activeLayerId, [placed]);
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
        if (kind === "label") onPlaceLabel(point);
        else useEditorStore.getState().addObjects(activeLayerId, [makeObject(kind, point, false)]);
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
    [activeLayerId, eraseAt, kind, onPlaceLabel, scatterAt],
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
