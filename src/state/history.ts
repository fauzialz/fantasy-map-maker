import type { LayerId, Scene, SceneObject, SceneSettings } from "../scene/types";

/** What one action did to one layer. An id missing on a side means created / deleted. */
export interface LayerDiff {
  layerId: LayerId;
  before: SceneObject[];
  after: SceneObject[];
}

/**
 * One undo step (ADR-22). Object edits carry **only what the action touched** — a terrain
 * stroke stores the landmasses it changed, never the scene. `scene` is the escape hatch for
 * actions that replace everything: a new canvas today, Generate in WP-10.
 */
export interface Step {
  label: string;
  layers: LayerDiff[];
  settings?: { before: SceneSettings; after: SceneSettings };
  scene?: { before: Scene; after: Scene };
}

// ponytail: value-compare through JSON because the worker hands back a fresh object for
// every landmass, changed or not — reference equality alone would drop the entire terrain
// layer into every stroke's step. One stringify per candidate object per action; if a
// stroke ever feels slow, compare path lengths before serializing.
const same = (a: SceneObject, b: SceneObject) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** The objects that differ between two versions of one layer, from both sides. */
function touched(before: SceneObject[], after: SceneObject[]): Omit<LayerDiff, "layerId"> | null {
  if (before === after) return null;
  const was = new Map(before.map((object) => [object.id, object]));
  const is = new Map(after.map((object) => [object.id, object]));

  const changedBefore = before.filter((object) => {
    const now = is.get(object.id);
    return !now || !same(object, now);
  });
  const changedAfter = after.filter((object) => {
    const then = was.get(object.id);
    return !then || !same(then, object);
  });

  return changedBefore.length || changedAfter.length
    ? { before: changedBefore, after: changedAfter }
    : null;
}

/** The step between two scenes, or null when the action changed nothing worth undoing. */
export function diffScene(before: Scene, after: Scene, label: string): Step | null {
  if (before === after) return null;

  const layers = after.layers.flatMap<LayerDiff>((layer) => {
    const was = before.layers.find((l) => l.id === layer.id);
    const diff = was && touched(was.objects, layer.objects);
    return diff ? [{ layerId: layer.id, ...diff }] : [];
  });
  const settings =
    before.settings === after.settings
      ? undefined
      : { before: before.settings, after: after.settings };

  if (layers.length === 0 && !settings) return null;
  return { label, layers, settings };
}

/**
 * Replace the touched objects, drop the ones this direction doesn't want, and append the
 * ones it resurrects. Position in the array is creation order only — draw order is computed
 * from `(z, y, scale)` — so appending a restored object is invisible on the map.
 */
function applyObjects(
  objects: SceneObject[],
  from: SceneObject[],
  to: SceneObject[],
): SceneObject[] {
  const want = new Map(to.map((object) => [object.id, object]));
  const ids = new Set([...from, ...to].map((object) => object.id));

  const kept = objects
    .filter((object) => want.has(object.id) || !ids.has(object.id))
    .map((object) => want.get(object.id) ?? object);
  const present = new Set(kept.map((object) => object.id));

  return [...kept, ...to.filter((object) => !present.has(object.id))];
}

export function applyStep(scene: Scene, step: Step, direction: "undo" | "redo"): Scene {
  const to = direction === "undo" ? "before" : "after";
  const from = direction === "undo" ? "after" : "before";
  if (step.scene) return step.scene[to];

  return {
    ...scene,
    settings: step.settings ? step.settings[to] : scene.settings,
    layers: scene.layers.map((layer) => {
      const diff = step.layers.find((d) => d.layerId === layer.id);
      return diff
        ? { ...layer, objects: applyObjects(layer.objects, diff[from], diff[to]) }
        : layer;
    }),
  };
}

/** Everything a step touches, as one comparable key: same key = same target. */
const touchKey = (step: Step): string =>
  [
    step.settings ? "settings" : "",
    ...step.layers.flatMap((diff) => [...diff.before, ...diff.after].map((o) => o.id)).sort(),
  ].join(",");

/**
 * Fold a follow-up into the step below it — a slider fires an event per pixel, and forty
 * undo steps to walk back one drag is not an undo. Only ever merges same-label steps that
 * touch exactly the same objects, so `before` from the older and `after` from the newer
 * describe the same span; anything else is left as its own step.
 */
export function coalesce(older: Step, newer: Step): Step | null {
  if (older.label !== newer.label || touchKey(older) !== touchKey(newer)) return null;
  if (older.scene || newer.scene) return null;

  return {
    label: older.label,
    layers: older.layers.map((diff) => ({
      ...diff,
      after: newer.layers.find((d) => d.layerId === diff.layerId)?.after ?? diff.after,
    })),
    settings:
      older.settings && newer.settings
        ? { before: older.settings.before, after: newer.settings.after }
        : older.settings,
  };
}
