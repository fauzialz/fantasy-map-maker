import { useCallback, useEffect, useMemo, useState } from "react";
import type { LayerId, Point, River } from "../scene/types";
import { useEditorStore } from "../state/editorStore";

const LAYER: LayerId = "rivers";

/** A double-click's second press lands on the point the first one laid; drop the repeat. */
const MERGE_PX = 4;

interface Options {
  enabled: boolean;
  /** current zoom, so screen-constant grab radii convert to map space */
  scale: number;
  toMapPoint: (clientX: number, clientY: number) => Point;
}

/**
 * The river tool (ADR-14): rivers are a spline laid point by point, not a brush, and they
 * never touch the boolean terrain engine.
 *
 * **Drawing only, since WP-20.** Each click lays a control point, with a live ribbon
 * trailing the cursor; Enter or a double-click finishes, Escape abandons the draft.
 * Selecting a river, reshaping it by its control points and deleting it used to live here
 * too — a per-layer pointer mode of exactly the kind ADR-28 removed. They now belong to
 * the global selection, which means they work from any layer rather than only from this
 * one, and there is one Delete handler and one undo path instead of two.
 */
export function useRiverTool({ enabled, scale, toMapPoint }: Options) {
  const objectTool = useEditorStore((s) => s.objectTool);
  const riverWidth = useEditorStore((s) => s.riverWidth);
  const riverTaper = useEditorStore((s) => s.riverTaper);

  const [draft, setDraft] = useState<Point[]>([]);
  /** where the rubber band currently reaches — the cursor, while a draft is open */
  const [tip, setTip] = useState<Point | null>(null);

  const drawing = enabled && objectTool === "place";

  /** Turn the draft into a real river. Fewer than two points is a stray click, not a river. */
  const finish = useCallback(() => {
    if (draft.length >= 2) {
      const store = useEditorStore.getState();
      // The whole draft — however many clicks laid it — arrives as one object, so one step.
      store.record("draw river", () =>
        store.addObjects(LAYER, [
          {
            id: crypto.randomUUID(),
            type: "river",
            points: draft,
            width: riverWidth,
            taper: riverTaper,
            z: 0,
          },
        ]),
      );
    }
    setDraft([]);
    setTip(null);
  }, [draft, riverTaper, riverWidth]);

  const begin = useCallback(
    (clientX: number, clientY: number) => {
      if (!drawing) return false;
      const point = toMapPoint(clientX, clientY);
      setDraft((previous) => {
        const last = previous[previous.length - 1];
        const repeat =
          last && Math.hypot(last[0] - point[0], last[1] - point[1]) <= MERGE_PX / scale;
        return repeat ? previous : [...previous, point];
      });
      return true;
    },
    [drawing, scale, toMapPoint],
  );

  const hover = useCallback(
    (clientX: number, clientY: number) => {
      if (drawing) setTip(draft.length > 0 ? toMapPoint(clientX, clientY) : null);
    },
    [draft.length, drawing, toMapPoint],
  );

  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if (event.key === "Escape") {
        setDraft([]);
        setTip(null);
        return;
      }
      if (event.key === "Enter" && drawing) {
        event.preventDefault();
        finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawing, enabled, finish]);

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
    /** the points laid so far, so the draft shows where its corners are */
    points: draft,
    active: drawing,
    cursor: drawing ? "crosshair" : undefined,
  };
}
