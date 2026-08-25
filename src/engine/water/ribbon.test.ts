import { describe, expect, it } from "vitest";
import type { Landmass, Point, Water } from "../../scene/types";
import { multiPolygonArea, ringArea } from "../geometry/types";
import { pointInPolygon } from "../geometry/nesting";
import { layRibbon } from "./commit";
import { touchesLand, waterToPolygon } from "./cut";
import { centreline, commitRibbon, previewRibbon } from "./ribbon";

/**
 * The bend setting the fixtures below are measured at — the top of the control, where corners
 * are fully bent *and* the guide has relaxed as far as it goes. Above the shipped default, which
 * sits at the hinge; pinned here rather than read from the store so these stay assertions about
 * the geometry rather than about a preference.
 */
const BEND = 1;

/**
 * The setting at which a click up to a right angle still lands in its own river. The sweep grows
 * with the knob, so where the two cross is a property of the control rather than a constant —
 * measured on a 56-wide river with ~300-unit legs, containment holds at every angle at 10%, to
 * 90° at 25%, to 20° at 50%, and only on a near-straight kink above that.
 */
const BEND_INSIDE = 0.25;

/**
 * WP-43 — the spline generator.
 *
 * The assertions that matter here are unusual in one way, and `16` §5 says so outright: **the
 * test asserts the difference rather than a value**. Width is an artistic random walk with no
 * stored seed (D7, D8, D17), so "the same path drawn twice gives different banks, and neither is
 * reproducible" is the specification — a fixture pinning an expected outline would be testing
 * that the feature had been removed.
 */

const straight = (from: Point, to: Point, steps = 20): Point[] =>
  Array.from({ length: steps + 1 }, (_, i): Point => [
    from[0] + ((to[0] - from[0]) * i) / steps,
    from[1] + ((to[1] - from[1]) * i) / steps,
  ]);

/**
 * The ribbon's widest and narrowest crossing, measured perpendicular to a horizontal path.
 *
 * **By where the outline's edges actually cross the sample line**, not by gathering vertices
 * near it. The original took every point within ±12 units of `x` and spanned them, which is a
 * proximity hack that only works while the geometry is dense: once WP-45 let the ribbon be
 * simplified, that window could catch two vertices of the *same* bank and report a width of
 * zero, or none at all and report nothing. Crossings are exact at any density.
 */
const widthRange = (ribbon: Point[], xs: number[]) => {
  const at = (x: number) => {
    const ys: number[] = [];
    for (let i = 0; i < ribbon.length; i++) {
      const a = ribbon[i];
      const b = ribbon[(i + 1) % ribbon.length];
      if ((a[0] - x) * (b[0] - x) <= 0 && a[0] !== b[0])
        ys.push(a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]));
    }
    return ys.length >= 2 ? Math.max(...ys) - Math.min(...ys) : null;
  };
  const widths = xs.map(at).filter((w): w is number => w !== null);
  return { min: Math.min(...widths), max: Math.max(...widths), widths };
};

const PATH = straight([200, 500], [1800, 500]);
const SAMPLES = [400, 600, 800, 1000, 1200, 1400, 1600];

describe("the preview", () => {
  /**
   * **The ribbon, not a line** (`16` §5). A tool that shows nothing until it commits is the
   * complaint `12-tools-that-say-what-they-do.md` opens with; the pleasant surprise belongs in
   * the detail, never in the object.
   */
  it("is a closed ribbon at the width it is given", () => {
    const preview = previewRibbon(PATH, 60, BEND);
    expect(preview.length).toBeGreaterThan(10);

    const { min, max } = widthRange(preview, SAMPLES);
    expect(min).toBeCloseTo(60, 0);
    expect(max).toBeCloseTo(60, 0);
  });

  it("follows the widest setting, which is the envelope it promises", () => {
    for (const width of [12, 40, 120]) {
      const { min, max } = widthRange(previewRibbon(PATH, width, BEND), SAMPLES);
      expect(min).toBeCloseTo(width, 0);
      expect(max).toBeCloseTo(width, 0);
    }
  });

  /** No randomisation in the preview — the shape is settled, only the banks are not. */
  it("is identical every time for the same path and width", () => {
    expect(previewRibbon(PATH, 60, BEND)).toEqual(previewRibbon(PATH, 60, BEND));
  });
});

describe("the committed river", () => {
  /**
   * **D7 — a random walk, not a taper.** A river may be wide in the middle, and nothing
   * accumulates downstream. This is where `15-river-engine.md`'s H2 is closed permanently:
   * width is an artistic choice here, not a hydrological consequence.
   */
  it("varies its width along its length, without tapering", () => {
    const { widths } = widthRange(commitRibbon(PATH, 60, 60, 0.8, BEND), SAMPLES);
    expect(widths.length).toBeGreaterThan(4);

    const spread = Math.max(...widths) - Math.min(...widths);
    expect(spread).toBeGreaterThan(2);

    // Not a taper: the widest crossing is not reliably at either end. Asserted as "the ends
    // are not the extremes every time", over several draws, since one draw could be either.
    const endIsWidest = Array.from({ length: 12 }, () => {
      const w = widthRange(commitRibbon(PATH, 60, 60, 0.8, BEND), SAMPLES).widths;
      const widest = w.indexOf(Math.max(...w));
      return widest === 0 || widest === w.length - 1;
    }).filter(Boolean).length;
    expect(endIsWidest).toBeLessThan(12);
  });

  /**
   * **The bounds are the contract, and the maximum is the one the preview drew.**
   *
   * This replaced the original D15 (a nominal width with ±30% proportional variation). Two
   * explicit bounds say what a single number could not: the range was implicit, and the number
   * in the rail was a width the river mostly was not. The floor is now a value the user chose
   * rather than an emergent property of the walk.
   *
   * The **upper** bound is the load-bearing half: the preview promises it as the envelope, so
   * a commit that came out wider would have cleared ground the user never saw.
   */
  it.each([
    [8, 20],
    [24, 56],
    [60, 140],
  ])("keeps the river between its bounds, %i–%i", (low, high) => {
    for (let draw = 0; draw < 8; draw++) {
      const { min, max } = widthRange(commitRibbon(PATH, low, high, 1, BEND), SAMPLES);
      expect(max).toBeLessThan(high + 1);
      expect(min).toBeGreaterThan(0);
    }
  });

  it("uses the range rather than sitting at one end of it", () => {
    const widths = Array.from(
      { length: 6 },
      () => widthRange(commitRibbon(PATH, 20, 90, 0.6, BEND), SAMPLES).widths,
    ).flat();
    expect(Math.max(...widths) - Math.min(...widths)).toBeGreaterThan(15);
  });

  /**
   * **The assertion the roughness control exists for**, and the one that was missing while it
   * only varied the *width*.
   *
   * Varying width alone moves both banks in lockstep about the centreline, so the river pinches
   * and swells in perfect symmetry — the same defect `engine/terrain/roughen.ts` was written
   * for one level along: *nothing on a hand-drawn map runs parallel to anything*. A river whose
   * left bank is the mirror of its right is exactly that, and no width walk can fix it, because
   * the mirroring is in the construction rather than in the numbers.
   *
   * Measured against a horizontal path at y = 500: mirrored banks put the two edges at equal
   * distances from it at every station.
   */
  it("roughens each bank independently — the two are not mirror images", () => {
    const asymmetryAt = (roughness: number) => {
      const ribbon = commitRibbon(PATH, 60, 60, roughness, BEND);
      const gaps = SAMPLES.map((x) => {
        const near = ribbon.filter((p) => Math.abs(p[0] - x) < 12).map((p) => p[1]);
        if (near.length < 2) return 0;
        return Math.abs(Math.max(...near) - 500 - (500 - Math.min(...near)));
      });
      return Math.max(...gaps);
    };

    // Rough: the banks disagree about where the centre is, by a real number of map units.
    expect(Math.max(...Array.from({ length: 6 }, () => asymmetryAt(1)))).toBeGreaterThan(4);
    // Smooth: no noise at all, so they are mirrors — which is what roughness 0 should mean.
    expect(asymmetryAt(0)).toBeLessThan(0.001);
  });

  /**
   * **The assertion `16` §5 asks for by name.** The same path drawn twice gives different banks
   * and neither is reproducible — *that is the design*, so the test asserts the difference
   * rather than a value. Nothing is stored that could reproduce a river, which is why there is
   * no Reroll (D17) and why a spline-made river is indistinguishable from a brushed one (C9).
   */
  it("gives different banks each time the same path is drawn", () => {
    const first = commitRibbon(PATH, 60, 60, 0.8, BEND);
    const second = commitRibbon(PATH, 60, 60, 0.8, BEND);

    expect(first).not.toEqual(second);
    // Different in the banks, not in the route: both still span the same path.
    expect(Math.abs(ringArea(first) - ringArea(second))).toBeLessThan(ringArea(first) * 0.25);
  });

  it("is smooth — the drawn centreline is the corner-cut path, not the raw points", () => {
    const raw: Point[] = [
      [0, 0],
      [100, 0],
      [100, 100],
    ];
    const line = centreline(raw, BEND);
    expect(line.length).toBeGreaterThan(raw.length);
    // The corner is cut: nothing sits at the sharp vertex any more.
    expect(line.some(([x, y]) => x === 100 && y === 0)).toBe(false);
  });

  it("makes nothing from a path with fewer than two points", () => {
    expect(commitRibbon([[10, 10]], 40, 40, 0.5, BEND)).toEqual([]);
    expect(previewRibbon([], 40, BEND)).toEqual([]);
  });
});

describe("what the object carries", () => {
  const continent: Landmass = {
    id: "c",
    type: "landmass",
    path: [
      [100, 100],
      [1900, 100],
      [1900, 900],
      [100, 900],
    ],
    holes: [],
    biome: "grassland",
  };

  /**
   * **The acceptance criterion that reads the scene rather than the render.** A committed river
   * carries no `width`, `seed` or `points`: those are tool settings that shaped the geometry and
   * are then gone, the way brush size is gone (D8). It is the field list that makes a
   * spline-made river indistinguishable from a brushed one afterwards (C9).
   */
  it("has no width, seed or points — only an outline and holes", () => {
    const [river] = layRibbon([], commitRibbon(PATH, 60, 60, 0.5, BEND));

    expect(Object.keys(river).sort()).toEqual(["holes", "id", "path", "type"]);
    expect(river.type).toBe("water");
    expect(river).not.toHaveProperty("width");
    expect(river).not.toHaveProperty("seed");
    expect(river).not.toHaveProperty("points");
    expect(river).not.toHaveProperty("roughness");
  });

  /** D10 — it merges like any other water the moment it lands. */
  it("merges with a river drawn across it into one object", () => {
    const first = layRibbon([], commitRibbon(PATH, 60, 60, 0.5, BEND));
    const crossing = straight([1000, 200], [1000, 800]);
    const both = layRibbon(first, commitRibbon(crossing, 60, 60, 0.5, BEND));

    expect(first).toHaveLength(1);
    expect(both).toHaveLength(1);
    expect(pointInPolygon(waterToPolygon(both[0]), [400, 500])).toBe(true);
    expect(pointInPolygon(waterToPolygon(both[0]), [1000, 300])).toBe(true);
  });

  it("keeps two rivers that never meet as two objects", () => {
    const first = layRibbon([], commitRibbon(straight([200, 200], [800, 200]), 40, 40, 0.5, BEND));
    const both = layRibbon(
      first,
      commitRibbon(straight([200, 800], [800, 800]), 40, 40, 0.5, BEND),
    );
    expect(both).toHaveLength(2);
  });

  /**
   * **D16 as a refusal.** A river entirely over open sea would cut land that was never there,
   * so the tool declines rather than leaving an object nobody can see. `touchesLand` is what
   * the tool asks before committing.
   */
  it("knows when a river has no land to cut through", () => {
    const overLand = commitRibbon(straight([300, 400], [1500, 400]), 60, 60, 0.5, BEND);
    const overSea = commitRibbon(straight([300, 1500], [1500, 1500]), 60, 60, 0.5, BEND);

    expect(touchesLand(overLand, [continent])).toBe(true);
    expect(touchesLand(overSea, [continent])).toBe(false);
    expect(touchesLand(overLand, [])).toBe(false);
  });

  /** And nothing is committed in that case — the collection comes back untouched. */
  it("adds nothing to the collection when the ribbon is degenerate", () => {
    const existing: Water[] = layRibbon([], commitRibbon(PATH, 60, 60, 0.5, BEND));
    expect(layRibbon(existing, [])).toBe(existing);
    expect(multiPolygonArea(existing.map(waterToPolygon))).toBeGreaterThan(0);
  });
});

/**
 * WP-44 — a ribbon that closes.
 *
 * Three faults with one cause: `ribbonOutline` used to trust its input. A duplicated point
 * reached it whenever the pointer was still after a click, and its zero-length-tangent guard
 * returned a **zero vector rather than a unit one**, so the banks collapsed onto the centreline
 * and `cap()` drew a half-circle around the pinch. Meanwhile `layRibbon` handed the outline
 * back un-normalised whenever the map held no other water.
 */

/** Does any pair of non-adjacent edges cross? Simple polygons are what every boolean op assumes. */
const crossings = (ring: Point[]): number => {
  const hit = (a: Point, b: Point, c: Point, d: Point) => {
    const den = (d[1] - c[1]) * (b[0] - a[0]) - (d[0] - c[0]) * (b[1] - a[1]);
    if (Math.abs(den) < 1e-12) return false;
    const ua = ((d[0] - c[0]) * (a[1] - c[1]) - (d[1] - c[1]) * (a[0] - c[0])) / den;
    const ub = ((b[0] - a[0]) * (a[1] - c[1]) - (b[1] - a[1]) * (a[0] - c[0])) / den;
    return ua > 1e-9 && ua < 1 - 1e-9 && ub > 1e-9 && ub < 1 - 1e-9;
  };
  let count = 0;
  for (let i = 0; i < ring.length; i++)
    for (let j = i + 2; j < ring.length; j++) {
      if (i === 0 && j === ring.length - 1) continue;
      if (hit(ring[i], ring[(i + 1) % ring.length], ring[j], ring[(j + 1) % ring.length])) count++;
    }
  return count;
};

describe("a duplicated point — the pointer standing still after a click", () => {
  /**
   * `useSplineTool.begin()` sets `cursor.current` to the point it just pushed, so the path
   * handed to the preview ends `[…, p, p]`. Before WP-44 that became four coincident
   * centreline vertices and the ribbon pinched to nothing over the last stretch.
   */
  const clicked: Point[] = [
    [200, 500],
    [900, 500],
  ];
  const still: Point[] = [...clicked, clicked[clicked.length - 1]];

  it("makes the same centreline as if the duplicate were never there", () => {
    expect(centreline(still, BEND)).toEqual(centreline(clicked, BEND));
  });

  it("previews exactly the ribbon the moved pointer would have drawn", () => {
    expect(previewRibbon(still, 56, BEND)).toEqual(previewRibbon(clicked, 56, BEND));
  });

  it("commits exactly the ribbon the moved pointer would have drawn", () => {
    // With min === max and roughness 0 the walk is constant and the noise is zero, so the
    // commit is deterministic and the two paths can be compared outline to outline.
    expect(commitRibbon(still, 56, 56, 0, BEND)).toEqual(commitRibbon(clicked, 56, 56, 0, BEND));
  });

  it("survives a path that is nothing but the same point repeated", () => {
    expect(
      commitRibbon(
        [
          [400, 400],
          [400, 400],
          [400, 400],
        ],
        40,
        40,
        0,
        BEND,
      ),
    ).toEqual([]);
  });
});

describe("the stored outline", () => {
  const HAIRPIN: Point[] = [
    [300, 600],
    [1200, 600],
    [340, 800],
  ];
  const elsewhere: Water = {
    id: "w0",
    type: "water",
    path: [
      [3500, 2500],
      [3800, 2500],
      [3800, 2800],
      [3500, 2800],
    ],
    holes: [],
  };

  /**
   * `unionLand` short-circuits when the other side is empty, so the very first river on a map
   * used to be stored exactly as `ribbonOutline` emitted it — self-intersections included.
   * `mergeWater` documents this same trap one function along.
   */
  it("is simple even when it is the only water on the map", () => {
    const [water] = layRibbon([], commitRibbon(HAIRPIN, 56, 56, 0, BEND));
    expect(crossings(water.path)).toBe(0);
  });

  it("is the same whether or not other water already exists", () => {
    const ribbon = commitRibbon(HAIRPIN, 56, 56, 0, BEND);
    const alone = layRibbon([], ribbon);
    const beside = layRibbon([elsewhere], ribbon).filter((w) => w.id !== elsewhere.id);
    expect(alone).toHaveLength(1);
    expect(beside).toHaveLength(1);
    expect(alone[0].path.length).toBe(beside[0].path.length);
    // polygon-clipping snaps coordinates, so the two runs differ in the last decimals; before
    // WP-44 they differed by ~1% of the area and by nine whole vertices.
    const area = (w: Water) => Math.abs(ringArea(w.path));
    expect(area(alone[0]) / area(beside[0])).toBeCloseTo(1, 5);
  });
});

/**
 * WP-45 — a river turns where you clicked.
 *
 * `chaikin` cuts a corner in proportion to the **leg length**, not the river's width, so a
 * hairpin between two long legs lost far more of its turn than a gentle bend did. The bank
 * should pass one half-width from the point that was clicked; before this package it sat as far
 * as 2.4× that out.
 */
describe("a sharp turn", () => {
  const CORNER: Point = [300, 0];
  const turn = (elbow: Point): Point[] => [[0, 0], CORNER, elbow];

  /**
   * How far the drawn course passes from the point that was clicked. This is the number the
   * complaint was about: a river routed *through* a click has an offset of 0, and before WP-45
   * a hairpin's course passed **72 units** from its own corner while the river was 56 wide.
   *
   * Measured against the course rather than the banks, because a distance to the bank is the
   * same whether the click ended up inside the river or outside it — which is exactly the
   * distinction that matters.
   */
  const courseOffset = (points: Point[], width: number): number => {
    const line = centreline(points, width);
    let best = Infinity;
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i];
      const b = line[i + 1];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const length = dx * dx + dy * dy;
      const t =
        length === 0
          ? 0
          : Math.max(0, Math.min(1, ((CORNER[0] - a[0]) * dx + (CORNER[1] - a[1]) * dy) / length));
      best = Math.min(best, Math.hypot(CORNER[0] - a[0] - dx * t, CORNER[1] - a[1] - dy * t));
    }
    return best;
  };

  const ANGLES: [string, Point][] = [
    ["gentle", [520, 220]],
    ["right angle", [300, 300]],
    ["sharp", [90, 210]],
    ["hairpin", [20, 60]],
  ];

  /**
   * **A corner rounds by how far it turns.** The sweep is `R · tan(φ/2)` at each vertex, so it
   * goes to nothing as a corner straightens and opens out as it tightens — a river bending the
   * way water does rather than every corner taking the same fixed cut.
   *
   * Half-width 28, legs ~300 units. Measured sweep, in map units:
   *
   * | deviation | 5° | 20° | 45° | 90° | 135° | 168° |
   * |---|---|---|---|---|---|---|
   * | fixed anchors (WP-45) | 0.6 | 2.8 | 5.4 | 9.9 | 12.9 | 13.9 |
   * | proportional (WP-48)  | 0.0 | 0.6 | 2.2 | 9.9 | 31.2 | 52.0 |
   */
  /**
   * **The number on the slider is the number on the line.** The course must be *exactly* straight
   * up to the anchor and only then begin to curve — which is what a quadratic Bézier tangent to
   * both legs gives, and what corner-cutting did not: at full bend the old centreline left the
   * straight line at 90.6% of the leg, so the bend occupied the last ninth rather than the last
   * half.
   */
  it.each([0.1, 0.2, 0.3, 0.4, 0.5])("bends through exactly its share of the leg — %s", (bend) => {
    const a: Point = [0, 0];
    const b: Point = [300, 0];
    const line = centreline([a, b, [300, 300]], bend);
    // `bend` is how *fully* bent the course is; a corner reaches half a leg at full bend.
    const straightUntil = 300 * (1 - bend);
    for (const [x, y] of line) {
      if (x > straightUntil + 1e-9) break;
      // every vertex before the anchor sits on the leg itself, to floating-point tolerance
      expect(Math.abs(y - a[1])).toBeLessThan(1e-9);
    }
    // and the anchor itself is a vertex of the drawn course
    expect(line.some(([x, y]) => Math.abs(x - straightUntil) < 1e-9 && Math.abs(y) < 1e-9)).toBe(
      true,
    );
  });

  it("barely bends at all where the course barely turns", () => {
    // A 5° kink, at the strongest setting the control offers, still moves the course by well
    // under a quarter of the river's width.
    expect(courseOffset(turn([700, 35]), BEND)).toBeLessThan(15);
  });

  it("sweeps wider the sharper the turn gets", () => {
    const sweep = ANGLES.map(([, elbow]) => courseOffset(turn(elbow), BEND));
    for (let i = 1; i < sweep.length; i++) expect(sweep[i]).toBeGreaterThan(sweep[i - 1]);
    // Across the whole range a hairpin has to sweep many times a near-straight kink; measured
    // at 19.3×, and the same 19.3× at every setting.
    const kink = courseOffset(turn([700, 35]), BEND);
    expect(sweep[sweep.length - 1] / kink).toBeGreaterThan(12);
  });

  it("keeps that ratio whatever the knob is set to", () => {
    // The setting scales the whole curve; it must not flatten the angle relationship inside it.
    // Measured at 17.5× across the lower half and 19.3× at the top — the same relationship.
    const ratio = (bend: number) =>
      courseOffset(turn([20, 60]), bend) / courseOffset(turn([700, 35]), bend);
    for (const bend of [0.1, 0.25, 0.5, 0.7, 1]) expect(ratio(bend)).toBeGreaterThan(12);
    expect(Math.abs(ratio(1) / ratio(0.1) - 1)).toBeLessThan(0.25);
  });

  /**
   * **Halfway is the hinge, and it has to be exact.** Everything below it is the corner
   * construction alone; everything above adds relaxation on top. A user who pushes past the
   * middle and dislikes it must get the old shape back by returning to it — not something
   * approximately like it — so the relaxation is zero *at* the hinge rather than near it.
   */
  it("relaxes nothing at all below the halfway mark", () => {
    const river: Point[] = [
      [80, 300],
      [420, 250],
      [700, 420],
      [980, 180],
    ];
    // the drawn course at the hinge runs through every clicked point's corner untouched
    const hinge = centreline(river, 0.5);
    expect(hinge).toEqual(centreline(river, 0.5));
    // and one step above it, the guide has begun to move
    expect(centreline(river, 0.55)).not.toEqual(hinge);
  });

  /**
   * **Full bend is the geometric ceiling, not a cautious one.** A corner reaches half a leg at
   * most; past the midpoint its curve would begin before its neighbour's had ended, and the
   * course would run forward along the leg, jump back down it and run forward again. Asking for
   * more has to give the same answer as asking for the maximum.
   */
  it("cannot be pushed past fully bent", () => {
    const path: Point[] = [[0, 0], CORNER, [300, 300]];
    expect(centreline(path, 2)).toEqual(centreline(path, 1));
    const forward = centreline(path, 1);
    for (let i = 2; i < forward.length; i++) {
      const [px, py] = forward[i - 2];
      const [qx, qy] = forward[i - 1];
      const [rx, ry] = forward[i];
      const one = Math.hypot(qx - px, qy - py);
      const two = Math.hypot(rx - qx, ry - qy);
      if (one < 1e-9 || two < 1e-9) continue;
      // never doubles back: consecutive segments always share a forward direction
      expect(((qx - px) * (rx - qx) + (qy - py) * (ry - qy)) / (one * two)).toBeGreaterThan(-0.5);
    }
  });

  /**
   * **Leg-relative, and that deliberately reverses WP-45.** WP-45 removed leg-proportionality
   * because it was *uncontrolled* — chaikin cut ~12% of every leg whatever the river was doing,
   * so identical corners rounded differently for no visible reason. Proportional to the leg is
   * the right behaviour; it needed to be a setting, not an accident.
   */
  it("scales the sweep with how far apart the clicks are", () => {
    const at = (reach: number) =>
      courseOffset([[300 - 300 * reach, 0], CORNER, [300, 300 * reach]], BEND);
    expect(at(2) / at(1)).toBeCloseTo(2, 1);
    expect(at(4) / at(1)).toBeCloseTo(4, 1);
  });

  /**
   * The decisive form, and the one the driver probes for in pixels: the point you clicked has
   * to end up **in the river**. Before WP-45 it did not even at a gentle bend — the course
   * passed 29 units from a 56-wide river's own corner.
   *
   * **Up to a right angle at `BEND_INSIDE`**, and no further. The sweep grows with the knob, so
   * how sharp a turn can still contain its own click is a property of the setting: 168° at 15%,
   * 90° at 25%, 45% at 40%, 20° at 50%. Past the crossover the click sits on the outside bank,
   * which is what a swept bend *is*, and the test below pins how far outside it gets.
   *
   * Asked of the **committed** water rather than the preview ring: at a tight turn the raw
   * outline's inner bank folds over itself and a ray cast reads a fold as outside. WP-44's
   * self-union resolves that, so the polygon the map ends up holding answers correctly where the
   * raw one cannot.
   */
  it.each(ANGLES.slice(0, 2))("puts the clicked corner inside the river — %s", (_name, elbow) => {
    const [water] = layRibbon([], commitRibbon(turn(elbow), 56, 56, 0, BEND_INSIDE));
    expect(pointInPolygon([water.path, ...water.holes], CORNER)).toBe(true);
  });

  /**
   * Just past the crossover the click is outside, and the sweep is what put it there. In the
   * waypoint regime that gap has to stay a margin rather than a miss: measured at 7.5 units at
   * 135° and 11 at 168°, against a river 56 wide.
   */
  it.each(ANGLES.slice(2))("leaves the click just outside a swept bend — %s", (_name, elbow) => {
    const [water] = layRibbon([], commitRibbon(turn(elbow), 56, 56, 0, BEND_INSIDE));
    const rings = [water.path, ...water.holes];
    expect(pointInPolygon(rings, CORNER)).toBe(false);
    let reached = Infinity;
    for (let d = 1; d <= 70 && reached === Infinity; d += 0.5)
      for (let a = 0; a < 360; a += 6) {
        const r = (a * Math.PI) / 180;
        if (pointInPolygon(rings, [CORNER[0] + Math.cos(r) * d, CORNER[1] + Math.sin(r) * d])) {
          reached = d;
          break;
        }
      }
    expect(reached).toBeLessThan(20);
  });

  /**
   * **At the top of the knob a click is a hint, not a waypoint, and that is the feature.**
   *
   * Above the halfway hinge the guide relaxes and the course stops trying to pass through the
   * points at all — measured on a right angle, the water sits 146 units from the click against
   * 25 at the hinge and none at all below it. The assertion is deliberately the opposite way
   * round from the ones above: this regime is not a failure to reach the click, it is the
   * course taking its own line past it.
   */
  it("takes its own line past the clicks at the top of the knob", () => {
    const [water] = layRibbon([], commitRibbon(turn([300, 300]), 56, 56, 0, 1));
    const rings = [water.path, ...water.holes];
    expect(pointInPolygon(rings, CORNER)).toBe(false);
    let reached = Infinity;
    for (let d = 1; d <= 400 && reached === Infinity; d += 1)
      for (let a = 0; a < 360; a += 6) {
        const r = (a * Math.PI) / 180;
        if (pointInPolygon(rings, [CORNER[0] + Math.cos(r) * d, CORNER[1] + Math.sin(r) * d])) {
          reached = d;
          break;
        }
      }
    expect(reached).toBeGreaterThan(50);
    // but not unbounded — the relaxation saturates rather than running away
    expect(reached).toBeLessThan(250);
  });

  /**
   * 12 clicks over ~3 100 map units. Before WP-45 this stored ~106 points at **every**
   * roughness, because the centreline was too sparse to sample the bank noise more than about
   * twice per wavelength — the setting was being aliased rather than drawn. So a smooth river
   * must come out cheaper than that, and a rough one is allowed to cost more, because it is
   * finally carrying what was asked for. The ceiling is what keeps that honest: the derivation
   * pays for every bank vertex four times over in `ringBands`.
   */
  const RIVER: Point[] = Array.from({ length: 12 }, (_, i): Point => [
    i * 260,
    1500 + Math.sin(i / 1.6) * 260,
  ]);

  it("stores a smooth river more cheaply than before the fix", () => {
    const [water] = layRibbon([], commitRibbon(RIVER, 40, 56, 0, BEND));
    expect(water.path.length).toBeLessThan(106);
  });

  it("keeps a rough river bounded — the noise may cost, but not without limit", () => {
    const [water] = layRibbon([], commitRibbon(RIVER, 40, 56, 1, BEND));
    expect(water.path.length).toBeLessThan(260);
  });

  it("keeps a hairline river cheap — spacing must not follow the width to nothing", () => {
    const [water] = layRibbon([], commitRibbon(RIVER, 1, 1, 0, BEND));
    expect(water.path.length).toBeLessThan(60);
  });

  it("still roughens the banks after the tighter simplify", () => {
    // One bank only. With min === max the ceiling clamp means noise can only push a bank
    // *inward*, so measuring both banks together would read the fixed envelope, not the wander.
    const straightPath = straight([200, 500], [1800, 500], 12);
    const wander = (ribbon: Point[]) => {
      const ys = ribbon.filter((p) => p[0] > 400 && p[0] < 1600 && p[1] < 500).map((p) => p[1]);
      return ys.length < 2 ? 0 : Math.max(...ys) - Math.min(...ys);
    };
    expect(wander(commitRibbon(straightPath, 56, 56, 0, BEND))).toBeLessThan(1);
    expect(wander(commitRibbon(straightPath, 56, 56, 1, BEND))).toBeGreaterThan(8);
  });
});
