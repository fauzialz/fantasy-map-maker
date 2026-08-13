import { useCallback, useEffect, useRef, useState } from "react";
import { layRibbon } from "../engine/water/commit";
import { touchesLand } from "../engine/water/cut";
import { commitRibbon, previewRibbon } from "../engine/water/ribbon";
import type { Ring } from "../engine/geometry/types";
import type { Point } from "../scene/types";
import { selectLandmasses, selectWaters, useEditorStore } from "../state/editorStore";
import { useToastStore } from "../state/toastStore";

/** Points closer together than this add nothing but vertices to smooth away. */
const MIN_SPACING = 12;

interface Options {
  enabled: boolean;
  /** screen (client) coordinates → map-space */
  toMapPoint: (clientX: number, clientY: number) => Point;
}

/**
 * WP-43 — the spline generator: drag a path, get a river.
 *
 * **A drag, not a click-by-click polyline.** The tool this replaces was modal — click to add a
 * point, double-click or Enter to finish, Escape to abandon — and that state is what made a
 * double-click anywhere on the layer ambiguous (`07`, WP-20's bug). One gesture with a
 * beginning and an end needs none of it, gives one undo step for free, and matches how every
 * other water-making tool in the batch already feels.
 *
 * **The preview is the water, not a line** (`16` §5). A tool that shows nothing until it
 * commits is the exact complaint `12-tools-that-say-what-they-do.md` opens with, and the
 * pleasant surprise belongs in the *detail* — the wander of the banks — never in the *object*.
 * So the preview is the ribbon at its nominal width, and only the wander is decided on release.
 */
export function useSplineTool({ enabled, toMapPoint }: Options) {
  const [preview, setPreview] = useState<Ring | null>(null);
  const [drawing, setDrawing] = useState(false);
  const points = useRef<Point[]>([]);
  /** Redraws the preview when the width slider moves while the pointer is still. */
  const width = useEditorStore((s) => s.splineWidth);

  const begin = useCallback(
    (clientX: number, clientY: number) => {
      if (!enabled) return false;
      points.current = [toMapPoint(clientX, clientY)];
      setPreview(null);
      setDrawing(true);
      return true;
    },
    [enabled, toMapPoint],
  );

  // The width setting has to change the drawn preview **while the pointer is still** (`16` §5),
  // so the ribbon is rebuilt from the points whenever the setting moves, not only on mousemove.
  useEffect(() => {
    if (drawing && points.current.length >= 2)
      setPreview(previewRibbon(points.current, width));
  }, [drawing, width]);

  useEffect(() => {
    if (!drawing) return;

    const move = (event: MouseEvent) => {
      const point = toMapPoint(event.clientX, event.clientY);
      const last = points.current[points.current.length - 1];
      if (last && Math.hypot(point[0] - last[0], point[1] - last[1]) < MIN_SPACING) return;
      points.current.push(point);
      if (points.current.length >= 2)
        setPreview(previewRibbon(points.current, useEditorStore.getState().splineWidth));
    };

    const finish = () => {
      const path = points.current;
      points.current = [];
      setDrawing(false);
      setPreview(null);
      if (path.length < 2) return;

      const state = useEditorStore.getState();
      const ribbon = commitRibbon(path, state.splineWidth, state.splineRoughness);
      if (ribbon.length < 3) return;

      /**
       * **D16 as a refusal, not a warning.** A river entirely over open sea would remove land
       * that was never there, so it is invisible — exactly right at an estuary, and a silent
       * failure anywhere else. The preview already draws nothing there; committing an object
       * anyway would leave the map holding something the user cannot see, select by eye, or
       * explain. So it makes nothing and says why.
       */
      if (!touchesLand(ribbon, selectLandmasses(state))) {
        useToastStore
          .getState()
          .show("Nothing drawn — a river over open sea has no land to cut through");
        return;
      }

      const before = state.scene;
      state.setWaters(layRibbon(selectWaters(state), ribbon));
      state.commit(before, "draw river");
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", finish);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", finish);
    };
  }, [drawing, toMapPoint]);

  return { begin, preview, drawing };
}
