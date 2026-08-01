import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { callGeometry } from "../engine/worker/client";
import type { DropGesture } from "../engine/terrain/overlap";
import { hasFootprint, landmassAt, landmassBounds, type Bounds } from "../scene/bounds";
import { frameOf } from "../scene/frame";
import { rotateObjects, scaleObjects, translateObjects } from "../scene/transform";
import type { Landmass, Layer as SceneLayer, Point, Scene, SceneObject } from "../scene/types";
import { useEditorStore } from "../state/editorStore";
import { useToastStore } from "../state/toastStore";
import { resolveGesture } from "./gesture";
import { cursorForHandle, cursorForHover, type Handle } from "./handles";
import { SpatialIndex } from "./spatialIndex";

/**
 * Everything a selection may touch, wherever it lives (WP-18, ADR-28) — and since WP-14,
 * that includes landmasses, hit-tested by their path rather than by a box.
 *
 * Membership is not decided by layer: hidden and locked layers contribute nothing, which is
 * what keeps a marquee over a forest from taking 200 trees when you wanted three castles.
 *
 * Rivers stay out until WP-20. Landmasses are in the pool but **not in the index** —
 * `SpatialIndex` skips anything `objectBounds` will not measure, and `objectBounds` stays
 * undefined for a path object on purpose. That single fact is what gives WP-14 "selected,
 * but no handles": `frameOf` filters the same way, so a terrain selection cannot grow a
 * frame whose handles would do nothing (I9).
 */
const selectablePool = (layers: SceneLayer[]): SceneObject[] =>
  layers
    .filter((layer) => layer.visible && !layer.locked)
    .flatMap((layer) =>
      layer.objects.filter((object) => hasFootprint(object) || object.type === "landmass"),
    );

const landmassesIn = (objects: SceneObject[]): Landmass[] =>
  objects.filter((object): object is Landmass => object.type === "landmass");

/** Which layers hold any of these ids — the write-back set for a cross-layer edit. */
const layersHolding = (layers: SceneLayer[], ids: Set<string>) =>
  layers.filter((layer) => layer.objects.some((object) => ids.has(object.id)));

type Drag =
  | { kind: "move"; start: Point; snapshot: SceneObject[]; gesture?: DropGesture }
  | {
      kind: "scale" | "rotate";
      /** the handle the drag started on, so its cursor survives the whole drag */
      handle: Handle;
      /** the frame's angle when the drag began, so the delta applies absolutely */
      baseRotation: number;
      start: Point;
      origin: Point;
      snapshot: SceneObject[];
      gesture?: DropGesture;
    }
  | { kind: "marquee"; start: Point; additive: boolean };

interface Options {
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
export function useSelection({ enabled, scale, toMapPoint }: Options) {
  const layers = useEditorStore((s) => s.scene.layers);
  const objects = useMemo(() => selectablePool(layers), [layers]);
  const selection = useEditorStore((s) => s.selection);
  const [marquee, setMarquee] = useState<Bounds | null>(null);
  const drag = useRef<Drag | null>(null);
  /** The scene as the press landed, so the whole drag closes as one undo step. */
  const pending = useRef<Scene | null>(null);
  const [dragging, setDragging] = useState(false);
  /**
   * Whether the drag has actually *moved* anything yet, as opposed to a press that armed
   * one. A click on a landmass arms a move (so click-and-drag is one gesture), and keying
   * the ring suspension off `dragging` therefore froze and faded the rings for the length
   * of every plain click — a visible blink for a gesture that changed nothing. A marquee
   * started while land was selected did it too.
   */
  const [transforming, setTransforming] = useState(false);
  const [hoverCursor, setHoverCursor] = useState<string | undefined>(undefined);
  /**
   * A group has no inherent angle, so the frame carries one for as long as the selection
   * lasts. Deliberately not persisted: every new selection starts upright, with the
   * rotate knob back on top.
   */
  const [groupRotation, setGroupRotation] = useState(0);

  /**
   * Built only while the tool is in hand. The pool spans every layer now, so rebuilding it
   * on each scene change would put an index of the whole map inside every scatter stroke —
   * for a tool that is not even active.
   */
  const index = useMemo(() => new SpatialIndex(enabled ? objects : []), [enabled, objects]);
  const selected = useMemo(
    () => objects.filter((object) => selection.includes(object.id)),
    [objects, selection],
  );
  const selectionKey = useMemo(() => [...selection].sort().join(","), [selection]);
  useEffect(() => setGroupRotation(0), [selectionKey]);

  const frame = useMemo(() => frameOf(selected, groupRotation), [selected, groupRotation]);
  const selectedLandmasses = useMemo(() => landmassesIn(selected), [selected]);

  /**
   * A transform can now span layers, so the write-back does too — one `setLayerObjects`
   * per layer the drag actually touched. History needs nothing for this: a `Step` already
   * carries a `LayerDiff[]`, so the whole cross-layer drag is still one undo step.
   */
  const apply = useCallback((transformed: SceneObject[]) => {
    const state = useEditorStore.getState();
    const patched = new Map(transformed.map((object) => [object.id, object]));
    for (const layer of layersHolding(state.scene.layers, new Set(patched.keys()))) {
      state.setLayerObjects(
        layer.id,
        layer.objects.map((object) => patched.get(object.id) ?? object),
      );
    }
  }, []);

  const begin = useCallback(
    (clientX: number, clientY: number, shift: boolean) => {
      if (!enabled) return false;
      const point = toMapPoint(clientX, clientY);
      const store = useEditorStore.getState();
      pending.current = store.scene;

      // Footprint first, land as the fallback: a mountain standing on a coast wins the
      // click, because it is what you see and what is on top.
      const hit =
        index.hit(point[0], point[1]) ?? landmassAt(landmassesIn(objects), point[0], point[1]);
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
      // Same precedence the press resolves, land included — I4, and the reason bug #2
      // stayed invisible.
      const over =
        index.hit(point[0], point[1]) ?? landmassAt(landmassesIn(objects), point[0], point[1]);
      setHoverCursor(cursorForHover({ point, frame, overObject: over !== undefined, scale }));
    },
    [frame, enabled, index, objects, scale, toMapPoint],
  );

  /**
   * The drop, once land was part of the drag.
   *
   * Two things have to be true when this finishes. **C1**: no landmass overlaps another,
   * or `z`, draw order and a topmost hit rule all come back (`08` §3). And **one resolved
   * delta for the whole selection**: "keep apart" can move a landmass less far than it was
   * dragged, so a mountain dragged alongside it must travel the same reduced distance or it
   * ends up standing in the sea.
   */
  const resolveTerrainDrop = useCallback(
    async (
      before: Scene,
      movedLand: Landmass[],
      snapshot: SceneObject[],
      gesture: DropGesture,
      label: string,
    ) => {
      const state = useEditorStore.getState();
      const movedIds = new Set(movedLand.map((landmass) => landmass.id));
      const others = landmassesIn(
        state.scene.layers.find((layer) => layer.id === "terrain")?.objects ?? [],
      ).filter((landmass) => !movedIds.has(landmass.id));

      try {
        const result = await callGeometry("resolveDrop", {
          snapshot: movedLand,
          others,
          gesture,
          policy: state.overlapPolicy,
        });
        const store = useEditorStore.getState();
        store.setLandmasses(result.landmasses);

        // Everything else in the drag rides the *resolved* fraction, not the dragged one.
        if (result.fraction < 1) {
          const rest = snapshot.filter((object) => object.type !== "landmass");
          if (rest.length > 0) {
            const scaled =
              gesture.kind === "move"
                ? translateObjects(
                    rest,
                    gesture.delta[0] * result.fraction,
                    gesture.delta[1] * result.fraction,
                  )
                : rotateObjects(rest, gesture.origin, gesture.degrees * result.fraction);
            const patched = new Map(scaled.map((object) => [object.id, object]));
            for (const layer of layersHolding(store.scene.layers, new Set(patched.keys()))) {
              store.setLayerObjects(
                layer.id,
                layer.objects.map((object) => patched.get(object.id) ?? object),
              );
            }
          }
        }

        if (result.merged)
          useToastStore.getState().show("Landmasses merged — the larger piece kept its name");
        else if (result.fraction < 1)
          useToastStore.getState().show("Slid back to where it last fit");
      } catch (err) {
        useToastStore.getState().show(`Drop failed: ${(err as Error).message}`);
      } finally {
        // One step either way, and only after the resolution — otherwise undo would step
        // back to the unresolved position and leave land overlapping.
        useEditorStore.getState().commit(before, label);
      }
    },
    [],
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
        const dx = x - current.start[0];
        const dy = y - current.start[1];
        // A mousemove at the same pixel is still a mousemove; only a real delta counts.
        if (dx !== 0 || dy !== 0) setTransforming(true);
        current.gesture = { kind: "move", delta: [dx, dy] };
        apply(translateObjects(current.snapshot, dx, dy));
        return;
      }

      const [ox, oy] = current.origin;
      if (current.kind === "scale") {
        const from = Math.hypot(current.start[0] - ox, current.start[1] - oy);
        const to = Math.hypot(x - ox, y - oy);
        if (from > 1 && to !== from) setTransforming(true);
        if (from > 1) apply(scaleObjects(current.snapshot, { x: ox, y: oy }, to / from));
        return;
      }

      const before = Math.atan2(current.start[1] - oy, current.start[0] - ox);
      const after = Math.atan2(y - oy, x - ox);
      const degrees = ((after - before) * 180) / Math.PI;
      if (degrees !== 0) setTransforming(true);
      current.gesture = { kind: "rotate", origin: { x: ox, y: oy }, degrees };
      apply(rotateObjects(current.snapshot, { x: ox, y: oy }, degrees));
      // The frame turns with the group. A single object's frame reads its own rotation,
      // so this only matters for a multi-selection.
      setGroupRotation(current.baseRotation + degrees);
    };

    const stop = () => {
      const current = drag.current;
      if (current?.kind === "marquee" && marquee) {
        // Deliberately asymmetric: footprint objects by intersection (rbush), land by
        // **containment**. Clipping one bay of a crescent continent should take the trees
        // in that bay, not the continent.
        const contained = landmassesIn(objects).filter((landmass) => {
          const box = landmassBounds(landmass);
          return (
            box &&
            box.minX >= marquee.minX &&
            box.minY >= marquee.minY &&
            box.maxX <= marquee.maxX &&
            box.maxY <= marquee.maxY
          );
        });
        const inside = [...index.within(marquee), ...contained].map((object) => object.id);
        const store = useEditorStore.getState();
        store.setSelection(
          current.additive ? [...new Set([...store.selection, ...inside])] : inside,
        );
      }
      // Selection lives outside the scene, so a press that only picked or marqueed leaves
      // nothing to diff and commits no step.
      const before = pending.current;
      pending.current = null;
      const label = current?.kind === "marquee" ? "select" : (current?.kind ?? "move");
      // A marquee has no gesture and no snapshot; only a move or a transform can move land.
      const transform = current && current.kind !== "marquee" ? current : undefined;
      const movedLand = transform?.gesture ? landmassesIn(transform.snapshot) : [];

      if (before && transform?.gesture && movedLand.length > 0) {
        // C1 has to hold at rest, so a drop that lands on other land resolves before it
        // commits. One worker round-trip on drop — never per frame.
        void resolveTerrainDrop(before, movedLand, transform.snapshot, transform.gesture, label);
      } else if (before) {
        useEditorStore.getState().commit(before, label);
      }

      drag.current = null;
      setMarquee(null);
      setDragging(false);
      setTransforming(false);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
    };
  }, [dragging, apply, index, marquee, objects, resolveTerrainDrop, toMapPoint]);

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
        const doomed = new Set(store.selection);
        const layers = layersHolding(store.scene.layers, doomed);
        store.record("delete", () => {
          for (const layer of layers) {
            store.removeObjects(
              layer.id,
              layer.objects.filter((object) => doomed.has(object.id)).map((object) => object.id),
            );
          }
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);

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
    /** Selected landmasses, which draw as an outline rather than entering the frame. */
    landmasses: selectedLandmasses,
    /** True while land is being dragged — rings suspend and fade for the duration (C2). */
    movingLand: transforming && selectedLandmasses.length > 0,
    count: selected.length,
    /** what the pointer should look like right now, or undefined to fall back */
    cursor: dragging ? dragCursor : hoverCursor,
  };
}
