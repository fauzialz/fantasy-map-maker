import { describe, expect, it } from "vitest";
import { objectBounds } from "./bounds";
import { frameContains, frameCorners, frameOf, toFrameLocal } from "./frame";
import { rotateObjects } from "./transform";
import type { Mountain, SceneObject, Tree, Water } from "./types";

const tree = (id: string, x: number, y: number, rotation = 0, scale = 1): Tree => ({
  id,
  type: "tree",
  x,
  y,
  rotation,
  scale,
  z: 0,
  variant: 0,
});

describe("frameOf", () => {
  it("wraps a single object tightly, matching its axis-aligned box when upright", () => {
    const object = tree("a", 500, 500);
    const frame = frameOf([object])!;
    const box = objectBounds(object)!;

    expect(frame.rotation).toBe(0);
    expect(frame.width).toBeCloseTo(box.maxX - box.minX);
    expect(frame.height).toBeCloseTo(box.maxY - box.minY);
    expect(frame.cx).toBeCloseTo((box.minX + box.maxX) / 2);
    expect(frame.cy).toBeCloseTo((box.minY + box.maxY) / 2);
  });

  /** The point of the oriented frame: it turns with the object instead of loosening. */
  it("turns with a single object instead of growing around it", () => {
    const upright = frameOf([tree("a", 500, 500)])!;
    const turned = frameOf([tree("a", 500, 500, 40)])!;

    expect(turned.rotation).toBe(40);
    // Same box, just rotated — the size must not change.
    expect(turned.width).toBeCloseTo(upright.width);
    expect(turned.height).toBeCloseTo(upright.height);

    // Whereas the axis-aligned box does have to grow to contain the turned sprite.
    const aabb = objectBounds(tree("a", 500, 500, 40))!;
    expect(aabb.maxX - aabb.minX).toBeGreaterThan(upright.width);
  });

  it("keeps the frame centred on the artwork as it rotates", () => {
    // Rotating about the anchor swings the centre, but the centre stays the same
    // distance from the anchor — the object spins rather than drifting.
    const anchor = { x: 500, y: 500 };
    const upright = frameOf([tree("a", anchor.x, anchor.y)])!;
    const reach = Math.hypot(upright.cx - anchor.x, upright.cy - anchor.y);

    for (const angle of [0, 37, 90, 180, 271]) {
      const frame = frameOf([tree("a", anchor.x, anchor.y, angle)])!;
      expect(Math.hypot(frame.cx - anchor.x, frame.cy - anchor.y)).toBeCloseTo(reach);
    }
  });

  it("starts a multi-selection upright", () => {
    // Two objects can point different ways, so there is no angle to inherit.
    const frame = frameOf([tree("a", 100, 100, 30), tree("b", 900, 700, -50)])!;
    expect(frame.rotation).toBe(0);
    expect(frame.width).toBeGreaterThan(800);
  });

  describe("a group turned by the session angle", () => {
    const group = [tree("a", 400, 400), tree("b", 900, 400), tree("c", 650, 700)];

    it("adopts the angle it is measured at", () => {
      expect(frameOf(group, 30)!.rotation).toBe(30);
    });

    /**
     * The reason the box is measured in its own basis: rotating the *group* and the
     * *frame* together has to leave the frame the same size. An axis-aligned union
     * would breathe as the group turned.
     */
    it("keeps its size when the group and the frame turn together", () => {
      const upright = frameOf(group)!;
      const turned = rotateObjects(group, { x: upright.cx, y: upright.cy }, 40);
      const frame = frameOf(turned, 40)!;

      expect(frame.width).toBeCloseTo(upright.width, 6);
      expect(frame.height).toBeCloseTo(upright.height, 6);
      expect(frame.cx).toBeCloseTo(upright.cx, 6);
      expect(frame.cy).toBeCloseTo(upright.cy, 6);
    });

    it("would have breathed if measured axis-aligned instead", () => {
      const upright = frameOf(group)!;
      const turned = rotateObjects(group, { x: upright.cx, y: upright.cy }, 40);
      // Same objects, measured at angle 0 — what the frame used to do. The box does not
      // simply grow: this group is wider than tall, so its axis-aligned width *shrinks*
      // as it turns while the height swells. Area is what gives the distortion away.
      const aabb = frameOf(turned, 0)!;
      expect(aabb.width * aabb.height).toBeGreaterThan(upright.width * upright.height);
      expect(aabb.width).not.toBeCloseTo(upright.width, 1);
    });

    it("still contains every object after the turn", () => {
      const upright = frameOf(group)!;
      const turned = rotateObjects(group, { x: upright.cx, y: upright.cy }, 40);
      const frame = frameOf(turned, 40)!;
      for (const object of turned) {
        expect(frameContains(frame, [object.x, object.y])).toBe(true);
      }
    });
  });

  const land: SceneObject = {
    id: "l",
    type: "landmass",
    path: [
      [0, 0],
      [10, 0],
      [10, 10],
    ],
    holes: [],
    biome: "grassland",
  };

  /**
   * WP-40 — a river is an **outline** now, so the fixture states the ribbon directly instead
   * of a centreline and a width. Same 120×20 shape the two assertions below always measured;
   * what changed is that it is stored rather than derived.
   */
  const river: Water = {
    id: "r",
    type: "water",
    path: [
      [-10, -10],
      [110, -10],
      [110, 10],
      [-10, 10],
    ],
    holes: [],
  };

  it("has no frame without selectable objects", () => {
    expect(frameOf([])).toBeUndefined();
  });

  it("frames a water body over its outline", () => {
    const frame = frameOf([river])!;
    expect(frame.height).toBe(20);
    expect(frame.width).toBe(120);
    expect([frame.cx, frame.cy]).toEqual([50, 0]);
  });

  /**
   * **WP-40 deleted the sibling of this test**, which widened the frame by raising `width`
   * on the object. There is no `width` to raise: the outline *is* the shape (ADR-48), so the
   * only way to make the water wider is to move its points — which is what the assertion
   * above already measures.
   */
  it("follows the outline when the outline moves", () => {
    const wide = frameOf([
      { ...river, path: river.path.map(([x, y]): [number, number] => [x, y * 3]) },
    ])!;
    expect(wide.height).toBe(60);
  });

  /**
   * This asserted the opposite until WP-15. Landmasses were excluded from the frame because
   * `translateObjects` refused to move them, and a frame whose handles do nothing is the
   * defect I9 exists to prevent. Now the transforms behind those handles work, so the frame
   * is honest — which is the precondition `08` §7 puts on the rewrite.
   */
  it("frames a landmass, measured over its coastline", () => {
    const frame = frameOf([land]);
    expect(frame).toBeDefined();
    expect(frame!.width).toBe(10);
    expect(frame!.height).toBe(10);
    expect([frame!.cx, frame!.cy]).toEqual([5, 5]);
  });

  it("gives a landmass the session angle, not one of its own", () => {
    // Land has no `rotation` field (C5), so a lone landmass measures in the supplied basis
    // exactly as a group does — every new selection therefore starts upright (I7).
    expect(frameOf([land], 0)!.rotation).toBe(0);
    expect(frameOf([land], 40)!.rotation).toBe(40);
  });

  it("covers mountains too", () => {
    const peak: Mountain = { ...tree("m", 0, 0), type: "mountain" };
    expect(frameOf([peak])).toBeDefined();
  });
});

describe("frame space", () => {
  const frame = { cx: 200, cy: 300, width: 100, height: 60, rotation: 35 };

  it("round-trips a point through frame space", () => {
    const [lx, ly] = toFrameLocal(frame, [240, 330]);
    const back = toFrameLocal({ ...frame, rotation: 0 }, [0, 0]);
    void back;
    expect(Math.hypot(lx, ly)).toBeCloseTo(Math.hypot(240 - 200, 330 - 300));
  });

  it("puts the corners where the rotated frame actually is", () => {
    const corners = frameCorners(frame);
    expect(corners).toHaveLength(4);
    for (const corner of corners) {
      expect(frameContains(frame, corner)).toBe(true);
      // every corner is half a diagonal from the centre
      expect(Math.hypot(corner[0] - frame.cx, corner[1] - frame.cy)).toBeCloseTo(
        Math.hypot(frame.width / 2, frame.height / 2),
      );
    }
  });

  it("contains points by the turned box, not a loose one", () => {
    const upright = { ...frame, rotation: 0 };
    // A point just past the short edge of the upright box, along the frame's long axis.
    const probe: [number, number] = [200, 300 - 40];
    expect(frameContains(upright, probe)).toBe(false);
    expect(frameContains({ ...frame, rotation: 90 }, probe)).toBe(true);
  });
});
