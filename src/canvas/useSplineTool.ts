import { useCallback, useEffect, useRef, useState } from "react";
import { layRibbon } from "../engine/water/commit";
import { touchesLand } from "../engine/water/cut";
import { commitRibbon, previewRibbon } from "../engine/water/ribbon";
import type { Ring } from "../engine/geometry/types";
import type { Point } from "../scene/types";
import { selectLandmasses, selectWaters, useEditorStore } from "../state/editorStore";
import { useToastStore } from "../state/toastStore";

/** Two clicks landing on the same spot are one point — a double-click must not add a stub. */
const MIN_SPACING = 8;

interface Options {
  enabled: boolean;
  /** screen (client) coordinates → map-space */
  toMapPoint: (clientX: number, clientY: number) => Point;
}

/**
 * WP-43 — the spline generator: **click to lay a centreline, and get a river along it**.
 *
 * **Clicked points, not a freehand drag.** The path is a *guide* the user places deliberately,
 * the way a pen tool works — a river is a route across a map, chosen, and dragging a
 * brush-shaped gesture makes it a stroke instead. `16` §5 allows either ("drag or click a
 * path"); this is the click half, and it is the one the tool is named for.
 *
 * The clicked points are **consumed and discarded** on commit (ADR-48, D2). What is stored is
 * an outline, so there is no centreline that could later disagree with what is drawn, and a
 * spline-made river is indistinguishable from a brushed one afterwards (C9).
 *
 * **The preview is the water, not a line** (`16` §5). A tool that shows nothing until it
 * commits is the complaint `12-tools-that-say-what-they-do.md` opens with, and the pleasant
 * surprise belongs in the *detail* — the wander of the banks — never in the *object*. So the
 * ribbon is drawn through the points laid so far **and the pointer's current position**, which
 * makes the last segment a rubber band showing the river you would get by clicking here.
 */
export function useSplineTool({ enabled, toMapPoint }: Options) {
  const [preview, setPreview] = useState<Ring | null>(null);
  const [active, setActive] = useState(false);
  const points = useRef<Point[]>([]);
  const cursor = useRef<Point | null>(null);
  /** Redraws the preview when a tool setting moves while the pointer is still. */
  const width = useEditorStore((s) => s.splineWidth);

  const redraw = useCallback(() => {
    const path = cursor.current ? [...points.current, cursor.current] : points.current;
    setPreview(
      path.length >= 2 ? previewRibbon(path, useEditorStore.getState().splineWidth) : null,
    );
  }, []);

  /** One click lays one point. The first also arms the gesture. */
  const begin = useCallback(
    (clientX: number, clientY: number) => {
      if (!enabled) return false;
      const point = toMapPoint(clientX, clientY);
      const last = points.current[points.current.length - 1];
      // A double-click's second press lands on the first's pixel; without this the finishing
      // gesture would leave a zero-length stub on the end of every river.
      if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) >= MIN_SPACING)
        points.current.push(point);
      cursor.current = point;
      setActive(true);
      redraw();
      return true;
    },
    [enabled, redraw, toMapPoint],
  );

  /** The rubber band: the ribbon is redrawn through the pointer as if it were the next point. */
  const hover = useCallback(
    (clientX: number, clientY: number) => {
      if (!active) return;
      cursor.current = toMapPoint(clientX, clientY);
      redraw();
    },
    [active, redraw, toMapPoint],
  );

  const reset = useCallback(() => {
    points.current = [];
    cursor.current = null;
    setActive(false);
    setPreview(null);
  }, []);

  /**
   * Finish the river and commit it — double-click, or Enter.
   *
   * Returns whether it claimed the gesture, so `MapStage` can key its double-click handler on
   * **a river being drawn** rather than on the layer. That distinction is not pedantry: keying
   * it on the layer is what swallowed every double-click on the old rivers layer (`07`, WP-20's
   * bug), Select on or not.
   */
  const finish = useCallback(() => {
    const path = points.current;
    if (path.length < 2) {
      reset();
      return false;
    }

    const state = useEditorStore.getState();
    const ribbon = commitRibbon(path, state.splineWidth, state.splineRoughness);
    reset();
    if (ribbon.length < 3) return false;

    /**
     * **D16 as a refusal, not a warning.** A river entirely over open sea would remove land
     * that was never there, so it is invisible — exactly right at an estuary, and a silent
     * failure anywhere else. The preview already draws nothing there; committing anyway would
     * leave the map holding something the user cannot see, select by eye, or explain.
     */
    if (!touchesLand(ribbon, selectLandmasses(state))) {
      useToastStore
        .getState()
        .show("Nothing drawn — a river over open sea has no land to cut through");
      return true;
    }

    const before = state.scene;
    state.setWaters(layRibbon(selectWaters(state), ribbon));
    state.commit(before, "draw river");
    return true;
  }, [reset]);

  // A setting that moves mid-gesture has to change the drawn preview **while the pointer is
  // still** (`16` §5), so the ribbon is rebuilt from the points rather than only on a move.
  useEffect(() => {
    if (active) redraw();
  }, [active, redraw, width]);

  // Enter finishes, Escape abandons — the two keys the shortcuts sheet promises.
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === "Enter") {
        event.preventDefault();
        finish();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        reset();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, finish, reset]);

  // Leaving the tool must not leave a half-drawn river armed behind it.
  useEffect(() => {
    if (!enabled) reset();
  }, [enabled, reset]);

  return { begin, hover, finish, preview, active, count: points.current.length };
}
