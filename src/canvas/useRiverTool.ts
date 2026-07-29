import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isOnRiver } from "../engine/river";
import type { LayerId, Point, River } from "../scene/types";
import { useEditorStore } from "../state/editorStore";
import { HANDLE_PX } from "./handles";

const LAYER: LayerId = "rivers";

/** How close to a control point or a bank counts as a hit, in *screen* pixels (I8). */
const GRAB_PX = HANDLE_PX;
/** A double-click's second press lands on the point the first one laid; drop the repeat. */
const MERGE_PX = 4;

interface Options {
  enabled: boolean;
  /** current zoom, so screen-constant grab radii convert to map space */
  scale: number;
  toMapPoint: (clientX: number, clientY: number) => Point;
}

/** What a press at this point would do. Hover reads the same answer, so the two agree. */
type Probe = { kind: "grab"; index: number } | { kind: "pick"; id: string } | { kind: "clear" };

/**
 * The river tool (ADR-14): rivers are a spline laid point by point, not a brush, and they
 * never touch the boolean terrain engine.
 *
 * Two modes, following the layer's active tool:
 * - **place** — each click lays a control point, with a live ribbon trailing the cursor.
 *   Enter or a double-click finishes; Escape abandons the draft.
 * - **select** — click a river to select it, drag one of its control points to reshape it,
 *   Delete to remove it.
 */
export function useRiverTool({ enabled, scale, toMapPoint }: Options) {
  const objects = useEditorStore(
    (s) => s.scene.layers.find((layer) => layer.id === LAYER)?.objects ?? [],
  );
  const objectTool = useEditorStore((s) => s.objectTool);
  const selection = useEditorStore((s) => s.selection);
  const riverWidth = useEditorStore((s) => s.riverWidth);
  const riverTaper = useEditorStore((s) => s.riverTaper);

  const [draft, setDraft] = useState<Point[]>([]);
  /** where the rubber band currently reaches — the cursor, while a draft is open */
  const [tip, setTip] = useState<Point | null>(null);
  const [hoverCursor, setHoverCursor] = useState<string | undefined>(undefined);
  const grabbed = useRef<{ id: string; index: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const rivers = useMemo(
    () => objects.filter((object): object is River => object.type === "river"),
    [objects],
  );
  const selected = useMemo(
    () => rivers.find((river) => selection.includes(river.id)),
    [rivers, selection],
  );

  const drawing = enabled && objectTool === "place";
  const editing = enabled && objectTool === "select";

  /**
   * The single source of truth for "what is under the pointer". Both the press and the
   * cursor go through it, so what the pointer promises is what the press does (I4).
   */
  const probe = useCallback(
    (point: Point): Probe => {
      const slack = GRAB_PX / scale;
      if (selected) {
        const index = selected.points.findIndex(
          ([x, y]) => Math.hypot(x - point[0], y - point[1]) <= slack,
        );
        if (index >= 0) return { kind: "grab", index };
      }
      // Last drawn is topmost, so the click picks the river you can see.
      for (let i = rivers.length - 1; i >= 0; i--) {
        if (isOnRiver(rivers[i], point, slack)) return { kind: "pick", id: rivers[i].id };
      }
      return { kind: "clear" };
    },
    [rivers, scale, selected],
  );

  /** Turn the draft into a real river. Fewer than two points is a stray click, not a river. */
  const finish = useCallback(() => {
    if (draft.length >= 2) {
      useEditorStore.getState().addObjects(LAYER, [
        {
          id: crypto.randomUUID(),
          type: "river",
          points: draft,
          width: riverWidth,
          taper: riverTaper,
          z: 0,
        },
      ]);
    }
    setDraft([]);
    setTip(null);
  }, [draft, riverTaper, riverWidth]);

  const begin = useCallback(
    (clientX: number, clientY: number) => {
      if (!drawing && !editing) return false;
      const point = toMapPoint(clientX, clientY);

      if (drawing) {
        setDraft((previous) => {
          const last = previous[previous.length - 1];
          const repeat =
            last && Math.hypot(last[0] - point[0], last[1] - point[1]) <= MERGE_PX / scale;
          return repeat ? previous : [...previous, point];
        });
        return true;
      }

      const found = probe(point);
      if (found.kind === "grab" && selected) {
        grabbed.current = { id: selected.id, index: found.index };
        setDragging(true);
      } else {
        useEditorStore.getState().setSelection(found.kind === "pick" ? [found.id] : []);
      }
      return true;
    },
    [drawing, editing, probe, scale, selected, toMapPoint],
  );

  const hover = useCallback(
    (clientX: number, clientY: number) => {
      if (drawing) {
        setTip(draft.length > 0 ? toMapPoint(clientX, clientY) : null);
        setHoverCursor("crosshair");
        return;
      }
      if (!editing) {
        setHoverCursor(undefined);
        return;
      }
      const found = probe(toMapPoint(clientX, clientY));
      setHoverCursor(
        found.kind === "grab" ? "move" : found.kind === "pick" ? "pointer" : "default",
      );
    },
    [draft.length, drawing, editing, probe, toMapPoint],
  );

  // Dragging a control point rewrites just that point; the ribbon re-derives from it.
  useEffect(() => {
    if (!dragging) return;

    const move = (event: MouseEvent) => {
      const grab = grabbed.current;
      if (!grab) return;
      const point = toMapPoint(event.clientX, event.clientY);
      const store = useEditorStore.getState();
      const river = store.scene.layers
        .find((layer) => layer.id === LAYER)
        ?.objects.find((object) => object.id === grab.id) as River | undefined;
      if (!river) return;
      store.patchObject<River>(LAYER, grab.id, {
        points: river.points.map((existing, i) => (i === grab.index ? point : existing)),
      });
    };
    const stop = () => {
      grabbed.current = null;
      setDragging(false);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", stop);
    };
  }, [dragging, toMapPoint]);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const store = useEditorStore.getState();

      if (event.key === "Escape") {
        setDraft([]);
        setTip(null);
        store.setSelection([]);
        return;
      }
      if (event.key === "Enter" && drawing) {
        event.preventDefault();
        finish();
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && editing) {
        if (store.selection.length === 0) return;
        event.preventDefault();
        store.removeObjects(LAYER, store.selection);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawing, editing, enabled, finish]);

  // Abandon a half-drawn river when the tool or layer changes, rather than leaving it to
  // reappear later attached to whatever the user does next.
  useEffect(() => {
    if (!drawing) {
      setDraft([]);
      setTip(null);
    }
  }, [drawing]);

  /** The draft rendered as a real river, so what you drag out is what you get. */
  const preview = useMemo<River | null>(() => {
    const points = tip ? [...draft, tip] : draft;
    if (points.length < 2) return null;
    return {
      id: "draft",
      type: "river",
      points,
      width: riverWidth,
      taper: riverTaper,
      z: 0,
    };
  }, [draft, riverTaper, riverWidth, tip]);

  return {
    begin,
    hover,
    finish,
    preview,
    /** control points to draw: the draft's while drawing, the selected river's while editing */
    points: drawing ? draft : (selected?.points ?? []),
    active: drawing || editing,
    cursor: dragging ? "move" : hoverCursor,
  };
}
