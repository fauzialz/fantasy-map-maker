import { pointInPolygon } from "../engine/geometry/nesting";
import { distanceToSegment, isOnRiver } from "../engine/river";
import { landmassToPolygon } from "../engine/terrain/assemble";
import { footprint, hasFootprint } from "../scene/bounds";
import { SPRITE_HEIGHT, type SpriteKind } from "../sprites/registry";
import type { Landmass, Point, Ring, SceneObject } from "../scene/types";

/** Nearest approach from a point to a closed ring — the coastline, walked as segments. */
function distanceToRing(ring: Ring, point: Point): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++)
    best = Math.min(best, distanceToSegment(point, ring[i], ring[(i + 1) % ring.length]));
  return best;
}

/**
 * On the land, or close enough to its coast that the disc overlaps it. Lakes count as
 * coastline too — `pointInPolygon` is even-odd, so a point in a lake reads as outside, and
 * the ring walk then catches a brush nibbling at the lake's shore.
 *
 * ponytail: no bounding-box reject before the ring walk. A map holds a handful of
 * landmasses of a few hundred points each — a few thousand segment tests per mousemove,
 * against the 1–2k object budget the sibling scan already accepts. `pathBounds` is the
 * upgrade if a map ever carries enough coastline to feel it.
 */
const touchesLandmass = (landmass: Landmass, point: Point, radius: number): boolean =>
  pointInPolygon(landmassToPolygon(landmass), point) ||
  distanceToRing(landmass.path, point) <= radius ||
  landmass.holes.some((hole) => distanceToRing(hole, point) <= radius);

/**
 * Is this object under the eraser brush?
 *
 * Matching on the anchor alone would mean a big mountain whose body is clearly under the
 * cursor survives because its feet are not, so the footprint counts too — scaled, since
 * a jittered scatter varies object size.
 *
 * **Path objects answer the same question whole (WP-26, ADR-37).** Until this package
 * `hasFootprint` returned false for landmasses and rivers, so those two were not erasable
 * by any tool at any time — the scoped eraser's real defect, not its scope. They are asked
 * "does the disc touch you", never "how much of you", because partial removal of a path
 * object is a *reshape*: that is the sea brush's job on land and Select's on a river.
 */
export function isUnderBrush(object: SceneObject, point: Point, brushRadius: number): boolean {
  if (object.type === "landmass") return touchesLandmass(object, point, brushRadius);
  if (object.type === "river") return isOnRiver(object, point, brushRadius);
  if (!hasFootprint(object)) return false;
  const { left, right } = footprint(object);
  return Math.hypot(object.x - point[0], object.y - point[1]) <= brushRadius + (right - left) * 0.3;
}

/** What a sprite is actually drawn at: the kind's art constant times its own scale (WP-33). */
const drawnHeight = (kind: SpriteKind, scale: number) => SPRITE_HEIGHT[kind] * scale;

/**
 * Is there already a sibling too close to put this one down? (WP-35.)
 *
 * The scatter brush has always spaced the *stroke* — a new sprite drops once the pointer has
 * travelled `brushSize × 0.42` — but then jitters the drop by up to half the brush across, so
 * two consecutive sprites can still land on top of each other, and a second pass over the same
 * ground remembers nothing of the first. The generator never had this problem: `poisson()`
 * rejects a candidate that falls within `radius` of an *accepted point*. This is that rule,
 * borrowed for the brush.
 *
 * **The radius is a fraction of drawn height, not a constant**, which is WP-33's lesson applied
 * one level along: `SPRITE_HEIGHT` has been retuned twice (WP-28 did it in one package), and an
 * absolute spacing would silently change meaning each time. It is **pairwise** — the mean of the
 * two sprites' heights — because `spriteScale` is a knob, so 300% mountains beside 50% ones is
 * an ordinary map and a single-radius test would be visibly wrong on it.
 *
 * **Nothing is deleted and nothing is moved**: a crowded candidate is simply not placed. That is
 * the whole reason to prefer this over culling what is already down — principle 2 says every
 * object is the user's, and this never destroys one.
 *
 * ponytail: anchor distance against drawn height, not the ink. WP-21 built a flattened-path
 * silhouette, so a true area-overlap test is *possible* — it is O(n·m) polygon intersection per
 * candidate for a result that looks the same. Upgrade only if someone measures a case where the
 * two disagree.
 */
export function crowded(
  candidate: SceneObject,
  neighbours: SceneObject[],
  fraction: number,
): boolean {
  if (fraction <= 0) return false;
  const kind = candidate.type as SpriteKind;
  // Labels carry a `scale` too and are not in `SPRITE_HEIGHT`: their size is a stored number
  // in map units, so there is no art constant to take a fraction of. They are never scattered.
  if (!(kind in SPRITE_HEIGHT) || !("scale" in candidate)) return false;
  const mine = drawnHeight(kind, candidate.scale);
  return neighbours.some((other) => {
    if (other.type !== candidate.type || !("scale" in other)) return false;
    const gap = (fraction * (mine + drawnHeight(kind, other.scale))) / 2;
    return Math.hypot(other.x - candidate.x, other.y - candidate.y) < gap;
  });
}
