import type { Point } from "../../scene/types";
import { mulberry32 } from "../generator/fields";
import type { Ring } from "../geometry/types";
import { chaikin } from "../terrain/smooth";

/**
 * WP-43 — the spline generator: a drawn path becomes a **water polygon**, and the path is
 * then thrown away.
 *
 * That discard is the design rather than an economy (ADR-48, `16` D2). The tool is a *shape
 * generator*, standing in the same relation to its inputs as the world generator does to its
 * seed: what it emits is ordinary editable geometry, indistinguishable afterwards from a
 * brushed channel (C9). There is no centreline stored, so there is nothing that could later
 * disagree with the outline the user sees.
 */

/** Corner-cut the drawn points into a centreline. Open, so the two ends stay where drawn. */
export const centreline = (points: Point[]): Point[] => chaikin(points, 2, false);

/**
 * How far the width may wander from its nominal value, as a **fraction of that value** (D15).
 *
 * Proportional rather than absolute, which is the whole of D15: at ±30% a 40-unit river wanders
 * 28–52 and a 6-unit river wanders 4–8. **There is deliberately no floor** — and proportional
 * variation is what makes a floor unnecessary, because a river cannot wander to nothing when
 * every step is a fraction of where it already is.
 */
const MAX_DEVIATION = 0.3;

/** How many segments approximate the half-circle at each end. Six reads as round at any zoom. */
const CAP_STEPS = 6;

/**
 * The half-width at each point of the centreline: a **random walk**, not a taper (D7).
 *
 * A river may be wide in the middle, and nothing accumulates downstream — which closes
 * `15-river-engine.md`'s H2 permanently. Width is an artistic choice here, not a hydrological
 * consequence, and this is the line where that is decided.
 *
 * The walk is clamped rather than reflected, and it starts at 1 rather than at a random value,
 * so the width the rail promises is the width the river actually starts at.
 */
function widthWalk(count: number, roughness: number, random: () => number): number[] {
  const step = 0.06 + roughness * 0.14;
  const walk: number[] = [];
  let value = 1;
  for (let i = 0; i < count; i++) {
    value += (random() * 2 - 1) * step;
    walk.push(Math.min(Math.max(value, 1 - MAX_DEVIATION), 1 + MAX_DEVIATION));
    value = walk[i];
  }
  return walk;
}

/**
 * The closed outline of the ribbon: the left bank out, a cap, the right bank back, a cap.
 *
 * Each centreline point is pushed out along the normal of its local tangent — a central
 * difference, so a bend offsets smoothly instead of kinking at the vertex.
 *
 * `halfWidths` is passed in rather than generated here so the **preview and the commit can
 * share this function**: the preview hands it a flat array at the nominal width, and the commit
 * hands it the walk. `16` §5 requires exactly that split — the randomisation applies on commit,
 * the *shape* does not, so what you saw is what you get up to the wobble of its banks.
 */
export function ribbonOutline(line: Point[], halfWidths: number[]): Ring {
  if (line.length < 2) return [];

  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i < line.length; i++) {
    const [ax, ay] = line[Math.max(i - 1, 0)];
    const [bx, by] = line[Math.min(i + 1, line.length - 1)];
    const length = Math.hypot(bx - ax, by - ay) || 1;
    const nx = -(by - ay) / length;
    const ny = (bx - ax) / length;
    const half = halfWidths[i];
    const [x, y] = line[i];
    left.push([x + nx * half, y + ny * half]);
    right.push([x - nx * half, y - ny * half]);
  }

  /**
   * The two caps are resolved **before** the array is built, because `reverse()` mutates.
   *
   * Written inline as `...right.reverse()` followed by `cap(…, right[0], …)`, the spread runs
   * first and `right[0]` is then the *far* end of the river — so the opening cap was struck from
   * the wrong bank point and the outline crossed itself. A single ribbon still unioned to one
   * polygon, which is why it looked fine; two disjoint rivers came back as **three** objects,
   * and that is what caught it.
   */
  const endCap = cap(
    line[line.length - 1],
    line[line.length - 2],
    left[left.length - 1],
    halfWidths[halfWidths.length - 1],
  );
  const startCap = cap(line[0], line[1], right[0], halfWidths[0]);

  return [...left, ...endCap, ...right.reverse(), ...startCap];
}

/**
 * A half-circle closing one end, bulged along the flow rather than back into the river.
 *
 * **Both ends get one**, unlike the ribbon this replaces: that one tapered to a point at its
 * source, because a source was a meaningful end. With a random walk there is no source and no
 * mouth — the two ends are the same kind of end — so they are drawn the same way.
 */
function cap(end: Point, inward: Point, bankEnd: Point, radius: number): Point[] {
  if (radius <= 0 || !inward) return [];
  const [cx, cy] = end;
  const from = Math.atan2(bankEnd[1] - cy, bankEnd[0] - cx);
  let toward = Math.atan2(cy - inward[1], cx - inward[0]) - from;
  while (toward > Math.PI) toward -= 2 * Math.PI;
  while (toward < -Math.PI) toward += 2 * Math.PI;
  const direction = toward >= 0 ? 1 : -1;

  const arc: Point[] = [];
  for (let i = 1; i < CAP_STEPS; i++) {
    const angle = from + (direction * Math.PI * i) / CAP_STEPS;
    arc.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
  return arc;
}

/** The ribbon as the preview draws it: nominal width end to end, no randomisation. */
export function previewRibbon(points: Point[], width: number): Ring {
  const line = centreline(points);
  return ribbonOutline(line, new Array(line.length).fill(width / 2));
}

/**
 * The ribbon as it commits: the same shape, with banks that wander.
 *
 * **The seed is generated here and immediately forgotten** (D8, D17). Nothing about the
 * randomisation is stored, so there is no Reroll and can never be one — the way back from a
 * river you dislike is undo and draw again. That is a smaller feature than it sounds: the
 * alternative is a `seed` field on the object, which would make a spline-made river
 * distinguishable from a brushed one forever and break C9.
 */
export function commitRibbon(points: Point[], width: number, roughness: number): Ring {
  const line = centreline(points);
  if (line.length < 2) return [];
  const random = mulberry32((Math.random() * 2 ** 32) >>> 0);
  const walk = widthWalk(line.length, roughness, random);
  return ribbonOutline(
    line,
    walk.map((factor) => (width / 2) * factor),
  );
}
