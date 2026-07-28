import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { boundsCenter, boundsContainPoint, boundsOf, type Bounds } from "../scene/bounds";
import { restack, rotateObjects, scaleObjects, translateObjects } from "../scene/transform";
import type { LayerId, Point, SceneObject } from "../scene/types";
import { useEditorStore } from "../state/editorStore";
import { SpatialIndex } from "./spatialIndex";

/** Handle size in *screen* pixels, so handles stay grabbable at any zoom. */
const HANDLE_PX = 9;
const ROTATE_OFFSET_PX = 26;

export type HandleKind = "scale" | "rotate";

/** Which handle, if any, is under the point. Corners scale; the stalk above rotates. */
export function handleAt(bounds: Bounds, [px, py]: Point, scale: number): HandleKind | undefined {
  const reach = HANDLE_PX / scale;
  const center = boundsCenter(bounds);
  const rotateY = bounds.minY - ROTATE_OFFSET_PX / scale;
  if (Math.hypot(px - center.x, py - rotateY) <= reach) return "rotate";

  const corners: Point[] = [
    [bounds.minX, bounds.minY],
    [bounds.maxX, bounds.minY],
    [bounds.minX, bounds.maxY],
    [bounds.maxX, bounds.maxY],
  ];
  return corners.some(([cx, cy]) => Math.hypot(px - cx, py - cy) <= reach) ? "scale" : undefined;
}

type Drag =
  | { kind: "move"; start: Point; snapshot: SceneObject[] }
  | { kind: "scale" | "rotate"; start: Point; origin: Point; snapshot: SceneObject[] }
  | { kind: "marquee"; start: Point; additive: boolean };

interface Options {
  activeLayerId: LayerId;
  enabled: boolean;
  /** current zoom, so screen-constant handles convert to map space */
  scale: number;
  toMapPoint: (clientX: number, clientY: number) => Point;
}

/**
 * Click, shift-click and marquee multi-select (ADR-16), plus move / scale / rotate of the
 * whole selection and bring-forward / send-back.
 *
 * Every transform runs against the snapshot taken when the drag began, so dragging is
 * idempotent — no drift from accumulating deltas, and WP-9 gets a clean before/after pair
 * to turn into one undo step.
 */
export function useSelection({ activeLayerId, enabled, scale, toMapPoint }: Options) {
  const objects = useEditorStore(
    (s) => s.scene.layers.find((layer) => layer.id === activeLayerId)?.objects ?? [],
  );
  const selection = useEditorStore((s) => s.selection);
  const [marquee, setMarquee] = useState<Bounds | null>(null);
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState(false);

  const index = useMemo(() => new SpatialIndex(objects), [objects]);
  const selected = useMemo(
    () => objects.filter((object) => selection.includes(object.id)),
    [objects, selection],
  );
  const bounds = useMemo(() => boundsOf(selected), [selected]);

  const apply = useCallback(
    (transformed: SceneObject[]) => {
      const state = useEditorStore.getState();
      const patched = new Map(transformed.map((object) => [object.id, object]));
      const layer = state.scene.layers.find((l) => l.id === activeLayerId);
      if (!layer) return;
      state.setLayerObjects(
        activeLayerId,
        layer.objects.map((object) => patched.get(object.id) ?? object),
      );
    },
    [activeLayerId],
  );

  const begin = useCallback(
    (clientX: number, clientY: number, shift: boolean) => {
      if (!enabled) return false;
      const point = toMapPoint(clientX, clientY);
      const store = useEditorStore.getState();

      if (bounds && selected.length > 0) {
        const handle = handleAt(bounds, point, scale);
        if (handle) {
          drag.current = {
            kind: handle,
            start: point,
            origin: [boundsCenter(bounds).x, boundsCenter(bounds).y],
            snapshot: selected,
          };
          setDragging(true);
          return true;
        }
        if (boundsContainPoint(bounds, point[0], point[1])) {
          drag.current = { kind: "move", start: point, snapshot: selected };
          setDragging(true);
          return true;
        }
      }

      const hit = index.hit(point[0], point[1]);
      if (hit) {
        const next = shift
          ? selection.includes(hit.id)
            ? selection.filter((id) => id !== hit.id)
            : [...selection, hit.id]
          : [hit.id];
        store.setSelection(next);
        const snapshot = objects.filter((object) => next.includes(object.id));
        drag.current = { kind: "move", start: point, snapshot };
        setDragging(true);
        return true;
      }

      if (!shift) store.setSelection([]);
      drag.current = { kind: "marquee", start: point, additive: shift };
      setDragging(true);
      return true;
    },
    [bounds, enabled, index, objects, scale, selected, selection, toMapPoint],
  );

  useEffect(() => {
    if (!dragging) return;

    const move = (event: MouseEvent) => {
      const current = drag.current;
      if (!current) return;
      const [x, y] = toMapPoint(event.clientX, event.clientY);

      if (current.kind === "marquee") {
        setMarquee({
          minX: Math.min(current.start[0], x),
          minY: Math.min(current.start[1], y),
          maxX: Math.max(current.start[0], x),
          maxY: Math.max(current.start[1], y),
        });
        return;
      }

      if (current.kind === "move") {
        apply(translateObjects(current.snapshot, x - current.start[0], y - current.start[1]));
        return;
      }

      const [ox, oy] = current.origin;
      if (current.kind === "scale") {
        const from = Math.hypot(current.start[0] - ox, current.start[1] - oy);
        const to = Math.hypot(x - ox, y - oy);
        if (from > 1) apply(scaleObjects(current.snapshot, { x: ox, y: oy }, to / from));
        return;
      }

      const before = Math.atan2(current.start[1] - oy, current.start[0] - ox);
      const after = Math.atan2(y - oy, x - ox);
      apply(rotateObjects(current.snapshot, { x: ox, y: oy }, ((after - before) * 180) / Math.PI));
    };

    const stop = () => {
      const current = drag.current;
      if (current?.kind === "marquee" && marquee) {
        const inside = index.within(marquee).map((object) => object.id);
        const store = useEditorStore.getState();
        store.setSelection(
          current.additive ? [...new Set([...store.selection, ...inside])] : inside,
        );
      }
      drag.current = null;
      setMarquee(null);
      setDragging(false);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
    };
  }, [dragging, apply, index, marquee, toMapPoint]);

  // Delete removes the selection; Escape drops it.
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      const store = useEditorStore.getState();
      if (event.key === "Escape") store.setSelection([]);
      if ((event.key === "Delete" || event.key === "Backspace") && store.selection.length > 0) {
        event.preventDefault();
        store.removeObjects(activeLayerId, store.selection);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeLayerId, enabled]);

  const bringForward = useCallback(
    (direction: 1 | -1) => {
      const store = useEditorStore.getState();
      const layer = store.scene.layers.find((l) => l.id === activeLayerId);
      if (!layer || store.selection.length === 0) return;
      store.setLayerObjects(
        activeLayerId,
        restack(layer.objects, new Set(store.selection), direction),
      );
    },
    [activeLayerId],
  );

  return { begin, bounds, marquee, selection, count: selected.length, bringForward };
}
