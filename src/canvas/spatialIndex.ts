import RBush from "rbush";
import { objectBounds, type Bounds } from "../scene/bounds";
import type { SceneObject } from "../scene/types";

interface Entry extends Bounds {
  id: string;
}

/**
 * rbush index over the active layer's objects (ADR-16). Selection has to stay responsive
 * at 1–2k objects, and a marquee over a scattered forest is the worst case: a linear scan
 * touches every object on every drag frame, an R-tree touches the ones near the box.
 */
export class SpatialIndex {
  private tree = new RBush<Entry>();
  private byId = new Map<string, SceneObject>();

  constructor(objects: SceneObject[] = []) {
    this.rebuild(objects);
  }

  rebuild(objects: SceneObject[]): void {
    const entries: Entry[] = [];
    this.byId.clear();
    for (const object of objects) {
      const bounds = objectBounds(object);
      if (!bounds) continue;
      entries.push({ ...bounds, id: object.id });
      this.byId.set(object.id, object);
    }
    this.tree = new RBush<Entry>();
    this.tree.load(entries);
  }

  /** Topmost object whose box contains the point — topmost so clicking picks what you see. */
  hit(x: number, y: number): SceneObject | undefined {
    const found = this.tree.search({ minX: x, minY: y, maxX: x, maxY: y });
    if (found.length === 0) return undefined;
    let best: SceneObject | undefined;
    for (const entry of found) {
      const object = this.byId.get(entry.id);
      if (!object || !("y" in object)) continue;
      // Same order the renderer draws in, so the click picks the one on top.
      if (!best || !("y" in best) || object.y > best.y) best = object;
    }
    return best;
  }

  within(box: Bounds): SceneObject[] {
    return this.tree
      .search(box)
      .map((entry) => this.byId.get(entry.id))
      .filter((object): object is SceneObject => object !== undefined);
  }
}
