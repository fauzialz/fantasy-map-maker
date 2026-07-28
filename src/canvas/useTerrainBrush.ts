import { useCallback, useEffect, useRef, useState } from "react";
import { MASK_RESOLUTION } from "../engine/geometry/coords";
import { createMask, stampMask, type Mask } from "../engine/terrain/mask";
import { callGeometry } from "../engine/worker/client";
import type { Point } from "../scene/types";
import { selectLandmasses, useEditorStore } from "../state/editorStore";
import { describeTerrainChange } from "../state/terrainChange";
import { useToastStore } from "../state/toastStore";
import type { Size } from "./viewport";

interface Options {
  enabled: boolean;
  map: Size;
  /** screen (client) coordinates → map-space */
  toMapPoint: (clientX: number, clientY: number) => Point;
}

/**
 * The terrain brush (ADR-09): while dragging, the stroke is stamped into an offscreen
 * raster mask at a fixed internal resolution and previewed as a plain thick line. On
 * mouse-up the mask goes to the worker, which runs Pipeline A and returns landmasses.
 */
export function useTerrainBrush({ enabled, map, toMapPoint }: Options) {
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
      const mode = state.terrainTool === "sea" ? "erase" : "paint";
      const before = selectLandmasses(state);
      setCommitting(true);
      callGeometry("terrainCommit", {
        mask: current.mask,
        maskResolution: MASK_RESOLUTION,
        coastDetail: state.scene.settings.coastDetail,
        mode,
        existingLand: before,
      })
        .then(({ landmasses }) => {
          useEditorStore.getState().setLandmasses(landmasses);
          setError(null);

          // ponytail: this restore IS the undo for now. WP-9 replaces it with the command
          // stack; the toast and its Undo button stay as they are.
          const change = describeTerrainChange(before, landmasses, mode);
          if (change)
            useToastStore
              .getState()
              .show(change, () => useEditorStore.getState().setLandmasses(before));
        })
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
  }, [stroking, toMapPoint, toMask]);

  return { begin, previewPoints, committing, error };
}
