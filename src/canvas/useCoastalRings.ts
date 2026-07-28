import { useEffect, useState } from "react";
import type { MultiPolygon } from "../engine/geometry/types";
import { callGeometry } from "../engine/worker/client";
import { selectLandmasses, useEditorStore } from "../state/editorStore";
import type { Size } from "./viewport";

/** Rings are recomputed on commit only, so a burst of edits collapses into one pass. */
const DEBOUNCE_MS = 150;

/**
 * Coastal rings are **derived, never stored** (ADR-13): they are recomputed from the
 * landmasses whenever terrain or the ring settings change, in the worker, debounced.
 * Toggling `coastalRings` off is instant and skips the work entirely — the geometry can
 * never go stale because there is no stored copy to go stale.
 */
export function useCoastalRings(map: Size) {
  const landmasses = useEditorStore(selectLandmasses);
  const enabled = useEditorStore((s) => s.scene.settings.coastalRings);
  const ringCount = useEditorStore((s) => s.scene.settings.ringCount);
  const ringGap = useEditorStore((s) => s.scene.settings.ringGap);

  const [bands, setBands] = useState<MultiPolygon[]>([]);
  const [deriving, setDeriving] = useState(false);

  useEffect(() => {
    if (!enabled || landmasses.length === 0) {
      setBands([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setDeriving(true);
      callGeometry("deriveRings", {
        landmasses,
        canvas: { x: 0, y: 0, w: map.w, h: map.h },
        ringCount,
        ringGap,
      })
        .then((result) => {
          if (!cancelled) setBands(result.bands);
        })
        .catch(() => {
          if (!cancelled) setBands([]);
        })
        .finally(() => {
          if (!cancelled) setDeriving(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [landmasses, enabled, ringCount, ringGap, map.w, map.h]);

  return { bands, deriving };
}
