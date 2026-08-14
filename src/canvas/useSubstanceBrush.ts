import { useCallback, useEffect, useRef, useState } from "react";
import { MASK_RESOLUTION } from "../engine/geometry/coords";
import { createMask, stampMask, type Mask } from "../engine/terrain/mask";
import { callGeometry } from "../engine/worker/client";
import type { Point } from "../scene/types";
import { selectWaters, selectLandmasses, useEditorStore } from "../state/editorStore";
import { describeTerrainChange, describeWaterChange } from "../state/terrainChange";
import { useToastStore } from "../state/toastStore";
import type { Size } from "./viewport";

/**
 * What a stroke of this brush does. **Two substances, three modes, one gesture** — which is
 * `16`'s "no special cases" where it is most visible: the stamping, the preview, the undo step
 * and the worker round-trip are identical, and only the op at the end differs.
 */
export type BrushMode = "paint" | "carve" | "lay";

interface Options {
  enabled: boolean;
  mode: BrushMode;
  map: Size;
  /** screen (client) coordinates → map-space */
  toMapPoint: (clientX: number, clientY: number) => Point;
}

/**
 * The substance brush (ADR-09): while dragging, the stroke is stamped into an offscreen
 * raster mask at a fixed internal resolution and previewed as a plain thick line. On
 * mouse-up the mask goes to the worker, which runs Pipeline A and returns the new collection.
 *
 * **`carve` and `lay` are the water brush's two modes (WP-41, D4)**, and carve is the sea brush
 * exactly — it removes land, leaving ordinary banded sea. Lay adds a water object instead, which
 * cuts an unbanded channel (D5). Because those two results look different (D6), the mode is
 * legible in the map rather than only in the rail.
 *
 * Named for the substance rather than the terrain since WP-41: it commits to the landmass
 * collection or the water one depending on the mode, and the path either takes is the same path.
 */
export function useSubstanceBrush({ enabled, mode, map, toMapPoint }: Options) {
  const [previewPoints, setPreviewPoints] = useState<number[] | null>(null);
  const [stroking, setStroking] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stroke = useRef<{ mask: Mask; last: Point } | null>(null);

  const toMask = useCallback(
    ([x, y]: Point): Point => [x * MASK_RESOLUTION, y * MASK_RESOLUTION],
    [],
  );

  const begin = useCallback(
    (clientX: number, clientY: number) => {
      if (!enabled) return false;
      const point = toMapPoint(clientX, clientY);
      const mask = createMask(
        Math.ceil(map.w * MASK_RESOLUTION),
        Math.ceil(map.h * MASK_RESOLUTION),
      );
      const { brushSize } = useEditorStore.getState();
      stampMask(mask, toMask(point), toMask(point), brushSize * MASK_RESOLUTION);
      stroke.current = { mask, last: point };
      setPreviewPoints([point[0], point[1]]);
      setStroking(true);
      return true;
    },
    [enabled, map.h, map.w, toMapPoint, toMask],
  );

  useEffect(() => {
    if (!stroking) return;

    const move = (event: MouseEvent) => {
      const current = stroke.current;
      if (!current) return;
      const point = toMapPoint(event.clientX, event.clientY);
      const { brushSize } = useEditorStore.getState();
      stampMask(current.mask, toMask(current.last), toMask(point), brushSize * MASK_RESOLUTION);
      current.last = point;
      setPreviewPoints((prev) => (prev ? [...prev, point[0], point[1]] : prev));
    };

    const finish = () => {
      const current = stroke.current;
      stroke.current = null;
      setStroking(false);
      if (!current) return;

      const state = useEditorStore.getState();
      /** The stroke's undo step spans the worker round-trip, so the scene is captured here. */
      const sceneBefore = state.scene;
      setCommitting(true);

      /**
       * **Laying water is the only branch that writes the other collection**, so it is the only
       * one that needs its own call. Carve is the terrain pipeline's erase mode verbatim — the
       * design says "today's sea brush, unchanged", and the way to keep that promise is to run
       * literally the same op rather than a second implementation of it.
       */
      const done =
        mode === "lay"
          ? callGeometry("waterCommit", {
              mask: current.mask,
              maskResolution: MASK_RESOLUTION,
              coastDetail: state.scene.settings.coastDetail,
              existingWater: selectWaters(state),
            }).then(({ waters }) => {
              const store = useEditorStore.getState();
              store.setWaters(waters);
              store.commit(sceneBefore, "lay water");
            })
          : (() => {
              const before = selectLandmasses(state);
              const waterBefore = selectWaters(state);
              const terrainMode = mode === "carve" ? "erase" : "paint";
              return callGeometry("terrainCommit", {
                mask: current.mask,
                maskResolution: MASK_RESOLUTION,
                coastDetail: state.scene.settings.coastDetail,
                mode: terrainMode,
                existingLand: before,
                biome: state.terrainBiome,
                existingWater: waterBefore,
              }).then(({ landmasses, waters }) => {
                const store = useEditorStore.getState();
                /**
                 * **WP-42 — both halves, then one commit.** A stroke that grows land and shrinks
                 * the water it crosses is one edit; writing the two collections either side of a
                 * `commit` would make a single drag two undo steps, and undoing one of them
                 * would leave land sitting in a river.
                 *
                 * `waters` is null whenever the stroke missed the water, so an ordinary land
                 * stroke does not touch that layer at all.
                 */
                store.setLandmasses(landmasses);
                if (waters) store.setWaters(waters);
                store.commit(sceneBefore, terrainMode === "erase" ? "erase sea" : "paint land");

                // The toast records its own step rather than calling undo(), so it still
                // restores the land it is talking about even if the user has painted again.
                const change = describeTerrainChange(before, landmasses, terrainMode);
                const wet = waters ? describeWaterChange(waterBefore, waters) : null;
                // The water half wins the toast when both fired: it is the surprising one, and
                // the destructive one — a severed or covered river is what C8 makes unrecoverable
                // except by undo, while merged land is merely worth mentioning.
                const message = wet ?? change;
                if (message)
                  useToastStore.getState().show(message, () => {
                    const now = useEditorStore.getState();
                    now.record("restore land and water", () => {
                      now.setLandmasses(before);
                      if (waters) now.setWaters(waterBefore);
                    });
                  });
              });
            })();

      done
        .then(() => setError(null))
        .catch((err: Error) => setError(err.message))
        .finally(() => {
          setCommitting(false);
          setPreviewPoints(null);
        });
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", finish);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", finish);
    };
  }, [stroking, mode, toMapPoint, toMask]);

  return { begin, previewPoints, committing, error };
}
