import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Bounds } from "../scene/bounds";
import { frameOf } from "../scene/frame";
import { rotateObjects, scaleObjects, translateObjects } from "../scene/transform";
import type { LayerId, Point, Scene, SceneObject } from "../scene/types";
import { useEditorStore } from "../state/editorStore";
import { resolveGesture } from "./gesture";
import { cursorForHandle, cursorForHover, type Handle } from "./handles";
import { SpatialIndex } from "./spatialIndex";

type Drag =
  | { kind: "move"; start: Point; snapshot: SceneObject[] }
  | {
      kind: "scale" | "rotate";
      /** the handle the drag started on, so its cursor survives the whole drag */
      handle: Handle;
      /** the frame's angle when the drag began, so the delta applies absolutely */
      baseRotation: number;
      start: Point;
      origin: Point;
      snapshot: SceneObject[];
    }
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
  /** The scene as the press landed, so the whole drag closes as one undo step. */
  const pending = useRef<Scene | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hoverCursor, setHoverCursor] = useState<string | undefined>(undefined);
  /**
   * A group has no inherent angle, so the frame carries one for as long as the selection
   * lasts. Deliberately not persisted: every new selection starts upright, with the
   * rotate knob back on top.
   */
  const [groupRotation, setGroupRotation] = useState(0);

  const index = useMemo(() => new SpatialIndex(objects), [objects]);
  const selected = useMemo(
    () => objects.filter((object) => selection.includes(object.id)),
    [objects, selection],
  );
  const selectionKey = useMemo(() => [...selection].sort().join(","), [selection]);
  useEffect(() => setGroupRotation(0), [selectionKey]);

  const frame = useMemo(() => frameOf(selected, groupRotation), [selected, groupRotation]);

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
      pending.current = store.scene;

      const hit = index.hit(point[0], point[1]);
      const gesture = resolveGesture({
        point,
        frame,
        overObject: hit !== undefined,
        shift,
        scale,
      });

      if (gesture.kind === "scale" || gesture.kind === "rotate") {
        drag.current = {
          kind: gesture.kind,
          handle: gesture.handle,
          baseRotation: groupRotation,
          start: point,
          // Transforms pivot on the frame's centre, which for one object is the centre
          // of its artwork — so a lone sprite spins in place.
          origin: [frame!.cx, frame!.cy],
          snapshot: selected,
        };
      } else if (gesture.kind === "move") {
        drag.current = { kind: "move", start: point, snapshot: selected };
      } else if (gesture.kind === "pick" && hit) {
        const next = gesture.additive
          ? selection.includes(hit.id)
            ? selection.filter((id) => id !== hit.id)
            : [...selection, hit.id]
          : [hit.id];
        store.setSelection(next);
        // Arm a move from the same press, so click-and-drag is one gesture.
        drag.current = {
          kind: "move",
          start: point,
          snapshot: objects.filter((object) => next.includes(object.id)),
        };
      } else if (gesture.kind === "marquee") {
        if (!gesture.additive) store.setSelection([]);
        drag.current = { kind: "marquee", start: point, additive: gesture.additive };
      }

      setDragging(true);
      return true;
    },
    [frame, enabled, groupRotation, index, objects, scale, selected, selection, toMapPoint],
  );

  /**
   * Cursor feedback on hover. React bails out when the state is unchanged, so setting it
   * on every mouse move costs nothing while the pointer stays over the same region.
   */
  const hover = useCallback(
    (clientX: number, clientY: number) => {
      if (!enabled) {
        setHoverCursor(undefined);
        return;
      }
      const point = toMapPoint(clientX, clientY);
      setHoverCursor(
        cursorForHover({
          point,
          frame,
          overObject: index.hit(point[0], point[1]) !== undefined,
          scale,
        }),
      );
    },
    [frame, enabled, index, scale, toMapPoint],
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
      const degrees = ((after - before) * 180) / Math.PI;
      apply(rotateObjects(current.snapshot, { x: ox, y: oy }, degrees));
      // The frame turns with the group. A single object's frame reads its own rotation,
      // so this only matters for a multi-selection.
      setGroupRotation(current.baseRotation + degrees);
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
      // Selection lives outside the scene, so a press that only picked or marqueed leaves
      // nothing to diff and commits no step.
      const before = pending.current;
      pending.current = null;
      if (before)
        useEditorStore
          .getState()
          .commit(before, current?.kind === "marquee" ? "select" : (current?.kind ?? "move"));

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
        store.record("delete", () => store.removeObjects(activeLayerId, store.selection));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeLayerId, enabled]);

  // Whatever handle the drag started on keeps its own cursor for the whole drag —
  // reading the handle rather than assuming a diagonal, which flipped ne/sw to nwse.
  const active = drag.current;
  const dragCursor =
    active?.kind === "move"
      ? "move"
      : active?.kind === "scale" || active?.kind === "rotate"
        ? cursorForHandle(active.handle, frame?.rotation ?? 0)
        : undefined;

  return {
    begin,
    hover,
    frame,
    marquee,
    selection,
    count: selected.length,
    /** what the pointer should look like right now, or undefined to fall back */
    cursor: dragging ? dragCursor : hoverCursor,
  };
}
