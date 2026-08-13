import { useEffect, useRef, useState } from "react";
import type { MultiPolygon } from "../engine/geometry/types";
import type { CutLandmass } from "../engine/water/cut";
import { callGeometry } from "../engine/worker/client";
import type { Landmass, Water } from "../scene/types";
import { selectLandmasses, selectWaters, useEditorStore } from "../state/editorStore";
import { useToastStore } from "../state/toastStore";
import type { Size } from "./viewport";

/** Derivation is recomputed on commit only, so a burst of edits collapses into one pass. */
const DEBOUNCE_MS = 150;

/**
 * The **derived** half of the map: the land as it is actually drawn, and the coastal bands.
 *
 * Both are **derived, never stored** (ADR-13, extended to the land itself by ADR-47): they
 * are recomputed from the landmasses *and the water* whenever either changes, in the worker,
 * debounced. Neither can go stale, because there is no stored copy to go stale.
 *
 * **Suspended during a terrain drag (C2).** Deriving costs 119–488 ms against a 16 ms frame,
 * so a drag that rewrites the geometry on every mousemove would queue back-to-back
 * derivations for its whole length and saturate the worker. While `suspended` the hook keeps
 * what it already has and derives nothing; releasing it fires exactly one pass against the
 * geometry as dropped. The stale result is faded by the layers, so the freeze reads as
 * deliberate rather than broken.
 *
 * **At most one derivation is ever in flight.** A worker task cannot be interrupted once it
 * starts, so the only way not to fall behind is to never queue work for a world that has
 * already been replaced: while one derivation runs, changes only mark the result stale, and
 * the effect re-fires with whatever is current the moment it finishes.
 *
 * **`land` is null whenever there is no water**, and that is the fast path rather than an
 * absence — see `DerivedTerrain.land`. Every map in existence when WP-40 shipped is in it.
 */
export function useDerivedTerrain(map: Size, suspended = false) {
  const landmasses = useEditorStore(selectLandmasses);
  const waters = useEditorStore(selectWaters);
  const rings = useEditorStore((s) => s.scene.settings.coastalRings);
  const ringCount = useEditorStore((s) => s.scene.settings.ringCount);
  const ringGap = useEditorStore((s) => s.scene.settings.ringGap);

  const [bands, setBands] = useState<MultiPolygon[]>([]);
  const [land, setLand] = useState<CutLandmass[] | null>(null);
  const [deriving, setDeriving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** What the last dispatched derivation was for, so a finished pass doesn't re-fire itself. */
  const sent = useRef<{
    landmasses: Landmass[];
    waters: Water[];
    rings: boolean;
    ringCount: number;
    ringGap: number;
  } | null>(null);

  useEffect(() => {
    // Hold, do not clear: what is on screen is the last good derivation, and clearing would
    // make a drag look like it destroyed the coastline.
    if (suspended) return;
    /**
     * Water forces a derivation even with rings switched off — the cut *is* the coastline
     * now, not decoration on top of it. Rings alone no longer decide whether the worker runs.
     */
    if (landmasses.length === 0 || (!rings && waters.length === 0)) {
      setBands([]);
      setLand(null);
      sent.current = null;
      return;
    }

    const done = sent.current;
    if (
      deriving ||
      (done?.landmasses === landmasses &&
        done.waters === waters &&
        done.rings === rings &&
        done.ringCount === ringCount &&
        done.ringGap === ringGap)
    )
      return;

    const timer = setTimeout(() => {
      setDeriving(true);
      sent.current = { landmasses, waters, rings, ringCount, ringGap };
      callGeometry("deriveTerrain", {
        landmasses,
        waters,
        canvas: { x: 0, y: 0, w: map.w, h: map.h },
        ringCount,
        ringGap,
        rings,
      })
        .then((result) => {
          setBands(result.bands);
          setLand(result.land);
          setError(null);
        })
        .catch((err: Error) => {
          // A failed derivation used to mean rings quietly not existing. Say so instead —
          // and leave the land uncut rather than blank, which is wrong but still a map.
          setBands([]);
          setLand(null);
          setError(err.message);
          useToastStore.getState().show(`Terrain derivation failed: ${err.message}`);
        })
        .finally(() => setDeriving(false));
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [landmasses, waters, rings, ringCount, ringGap, map.w, map.h, deriving, suspended]);

  /**
   * True when the drawn land is behind the scene — mid-drag, or between a water edit and the
   * derivation that answers it. **Not the same as `land === null`**, which is the water-free
   * fast path and perfectly current.
   */
  const landStale = waters.length > 0 && (suspended || deriving || land === null);

  return { bands, land, deriving, error, stale: suspended, landStale };
}
