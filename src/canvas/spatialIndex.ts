import RBush from "rbush";
import { coversPoint, hasFootprint, objectBounds, type Bounds } from "../scene/bounds";
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

  /**
   * The object under a point: **box narrows, silhouette decides, topmost breaks the tie**
   * (ADR-30).
   *
   * rbush finds every candidate whose box contains the point, exactly as before. Among
   * them, one whose *artwork* covers the point beats one where the point fell in empty box
   * — that is where "which one did I mean" is a real question, and it is what stops a click
   * between a compass's arms from taking the compass.
   *
   * **A tie-break, deliberately not a filter.** If nothing's artwork covers the point, the
   * topmost box still wins, because at fit zoom a tree is a few pixels and demanding an
   * exact silhouette hit would make an isolated sprite *harder* to select for no gain (P2,
   * Fitts). Precision resolves ambiguity; it does not police aim.
   */
  hit(x: number, y: number): SceneObject | undefined {
    const found = this.tree.search({ minX: x, minY: y, maxX: x, maxY: y });
    if (found.length === 0) return undefined;
    let best: SceneObject | undefined;
    let bestCovered = false;
    for (const entry of found) {
      const object = this.byId.get(entry.id);
      if (!object || !("y" in object)) continue;
      const covered = hasFootprint(object) && coversPoint(object, x, y);
      if (bestCovered && !covered) continue;
      // Same order the renderer draws in, so a tie picks the one on top.
      if ((covered && !bestCovered) || !best || !("y" in best) || object.y > best.y) {
        best = object;
        bestCovered = covered;
      }
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
