import { useEffect, useRef, useState } from "react";
import type { MultiPolygon } from "../engine/geometry/types";
import { callGeometry } from "../engine/worker/client";
import type { Landmass } from "../scene/types";
import { selectLandmasses, useEditorStore } from "../state/editorStore";
import { useToastStore } from "../state/toastStore";
import type { Size } from "./viewport";

/** Rings are recomputed on commit only, so a burst of edits collapses into one pass. */
const DEBOUNCE_MS = 150;

/**
 * Coastal rings are **derived, never stored** (ADR-13): they are recomputed from the
 * landmasses whenever terrain or the ring settings change, in the worker, debounced.
 * Toggling `coastalRings` off is instant and skips the work entirely — the geometry can
 * never go stale because there is no stored copy to go stale.
 *
 * **At most one derivation is ever in flight.** A worker task cannot be interrupted once it
 * starts, so the only way not to fall behind is to never queue work for a world that has
 * already been replaced: while one derivation runs, changes only mark the result stale, and
 * the effect re-fires with whatever is current the moment it finishes. Re-rolling the
 * generator ten times costs one derivation per completed pass, not ten queued in a row.
 */
export function useCoastalRings(map: Size) {
  const landmasses = useEditorStore(selectLandmasses);
  const enabled = useEditorStore((s) => s.scene.settings.coastalRings);
  const ringCount = useEditorStore((s) => s.scene.settings.ringCount);
  const ringGap = useEditorStore((s) => s.scene.settings.ringGap);

  const [bands, setBands] = useState<MultiPolygon[]>([]);
  const [deriving, setDeriving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** What the last dispatched derivation was for, so a finished pass doesn't re-fire itself. */
  const sent = useRef<{ landmasses: Landmass[]; ringCount: number; ringGap: number } | null>(null);

  useEffect(() => {
    if (!enabled || landmasses.length === 0) {
      setBands([]);
      sent.current = null;
      return;
    }

    const done = sent.current;
    if (
      deriving ||
      (done?.landmasses === landmasses && done.ringCount === ringCount && done.ringGap === ringGap)
    )
      return;

    const timer = setTimeout(() => {
      setDeriving(true);
      sent.current = { landmasses, ringCount, ringGap };
      callGeometry("deriveRings", {
        landmasses,
        canvas: { x: 0, y: 0, w: map.w, h: map.h },
        ringCount,
        ringGap,
      })
        .then((result) => {
          setBands(result.bands);
          setError(null);
        })
        .catch((err: Error) => {
          // Rings failing used to mean rings quietly not existing. Say so instead.
          setBands([]);
          setError(err.message);
          useToastStore.getState().show(`Coastal rings failed: ${err.message}`);
        })
        .finally(() => setDeriving(false));
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [landmasses, enabled, ringCount, ringGap, map.w, map.h, deriving]);

  return { bands, deriving, error };
}
