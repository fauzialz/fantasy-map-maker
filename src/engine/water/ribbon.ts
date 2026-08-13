import { createNoise2D } from "simplex-noise";
import type { Point } from "../../scene/types";
import { mulberry32 } from "../generator/fields";
import type { Ring } from "../geometry/types";
import { chaikin } from "../terrain/smooth";

/**
 * WP-43 — the spline generator: a drawn course becomes a **water polygon**, and the course is
 * then thrown away.
 *
 * That discard is the design rather than an economy (ADR-48, `16` D2). The tool is a *shape
 * generator*, standing in the same relation to its inputs as the world generator does to its
 * seed: what it emits is ordinary editable geometry, indistinguishable afterwards from a
 * brushed channel (C9). There is no centreline stored, so there is nothing that could later
 * disagree with the outline the user sees.
 */

/** Corner-cut the clicked points into a centreline. Open, so the two ends stay where clicked. */
export const centreline = (points: Point[]): Point[] => chaikin(points, 2, false);

/** How many segments approximate the half-circle at each end. Six reads as round at any zoom. */
const CAP_STEPS = 6;

/** Cumulative distance along the line, so noise is sampled in map units rather than per vertex. */
const travelled = (line: Point[]): number[] => {
  const out = [0];
  for (let i = 1; i < line.length; i++)
    out.push(out[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  return out;
};

/**
 * The half-width at each point: a **random walk between the two bounds the user set** (D7).
 *
 * A river may be wide in the middle, and nothing accumulates downstream — which closes
 * `15-river-engine.md`'s H2 permanently. Width is an artistic choice, not a hydrological
 * consequence, and this is the line where that is decided.
 *
 * **Bounded by an explicit min and max**, which replaced a nominal width with ±30% variation
 * (the original D15). Proportional variation was doing two jobs at once and was legible as
 * neither: the number in the rail was a width the river mostly was not, and the range it could
 * reach was implicit. Two numbers say exactly what they mean, and a river can still never
 * wander to nothing because the floor is now a value the user chose rather than an emergent
 * property of the walk.
 */
function widthWalk(
  count: number,
  minWidth: number,
  maxWidth: number,
  roughness: number,
  random: () => number,
): number[] {
  const low = Math.min(minWidth, maxWidth) / 2;
  const high = Math.max(minWidth, maxWidth) / 2;
  const span = high - low;
  if (span <= 0) return new Array(count).fill(low);

  // A rough river changes width faster; a smooth one drifts. Both cover the whole range.
  const step = span * (0.08 + roughness * 0.22);
  const walk: number[] = [];
  let value = low + span * random();
  for (let i = 0; i < count; i++) {
    value += (random() * 2 - 1) * step;
    // Reflected at the bounds rather than clamped: clamping makes a rough river cling to its
    // limits in long flat runs, which reads as a canal with two straight edges.
    if (value < low) value = low + (low - value);
    if (value > high) value = high - (value - high);
    walk.push(Math.min(Math.max(value, low), high));
  }
  return walk;
}

/**
 * **Independent noise on each bank** — what "roughness" actually means (D13's "roughness noise").
 *
 * Varying only the *width* moves both banks in lockstep about the centreline, so the river
 * pinches and swells in perfect symmetry. That is the same defect `engine/terrain/roughen.ts`
 * was written for one level along: *nothing on a hand-drawn map runs parallel to anything.* A
 * river whose left bank is the mirror of its right is exactly that, and no width walk can fix
 * it, because the mirroring is in the construction rather than in the numbers.
 *
 * Sampled on **two different rows** of the same noise field, so the banks are decorrelated
 * without needing two fields, and along *travelled distance* so the wobble has a wavelength in
 * map units instead of one wobble per vertex.
 */
const bankNoise = (
  noise: (x: number, y: number) => number,
  distance: number,
  width: number,
  roughness: number,
  row: number,
): number => {
  if (roughness <= 0) return 0;
  const wavelength = Math.max(width, 24) * 2.2;
  return noise(distance / wavelength, row) * width * 0.45 * roughness;
};

/**
 * The closed outline: the left bank out, a cap, the right bank back, a cap.
 *
 * Each centreline point is pushed out along the normal of its local tangent — a central
 * difference, so a bend offsets smoothly instead of kinking at the vertex. **The two banks take
 * separate half-width arrays**, which is what lets the commit rough them independently while
 * the preview hands the same flat array to both.
 */
export function ribbonOutline(line: Point[], leftHalf: number[], rightHalf: number[]): Ring {
  if (line.length < 2) return [];

  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i < line.length; i++) {
    const [ax, ay] = line[Math.max(i - 1, 0)];
    const [bx, by] = line[Math.min(i + 1, line.length - 1)];
    const length = Math.hypot(bx - ax, by - ay) || 1;
    const nx = -(by - ay) / length;
    const ny = (bx - ax) / length;
    const [x, y] = line[i];
    left.push([x + nx * leftHalf[i], y + ny * leftHalf[i]]);
    right.push([x - nx * rightHalf[i], y - ny * rightHalf[i]]);
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
    leftHalf[leftHalf.length - 1],
  );
  const startCap = cap(line[0], line[1], right[0], rightHalf[0]);

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

/**
 * The **silhouette** the preview draws: a smooth ribbon at the *maximum* width, end to end.
 *
 * Max rather than the midpoint, deliberately. The preview's job is to promise the envelope the
 * river will fit inside, so nothing the commit does can come as a spatial surprise — the
 * randomisation is allowed to make the river *narrower* than what you saw, never wider than the
 * ground you cleared for it. The surprise belongs in the detail, never in the object (`12` §1).
 */
export function previewRibbon(points: Point[], maxWidth: number): Ring {
  const line = centreline(points);
  const half = new Array(line.length).fill(maxWidth / 2);
  return ribbonOutline(line, half, half);
}

/**
 * The ribbon as it commits: width wandering between the bounds, and each bank roughened alone.
 *
 * **The seed is generated here and immediately forgotten** (D8, D17). Nothing about the
 * randomisation is stored, so there is no Reroll and can never be one — the way back from a
 * river you dislike is undo and draw again. That is a smaller feature than it sounds: the
 * alternative is a `seed` field on the object, which would make a spline-made river
 * distinguishable from a brushed one forever and break C9.
 */
export function commitRibbon(
  points: Point[],
  minWidth: number,
  maxWidth: number,
  roughness: number,
): Ring {
  const line = centreline(points);
  if (line.length < 2) return [];

  const random = mulberry32((Math.random() * 2 ** 32) >>> 0);
  const noise = createNoise2D(random);
  const walk = widthWalk(line.length, minWidth, maxWidth, roughness, random);
  const distances = travelled(line);

  /**
   * **Clamped to the maximum the preview promised.** Bank noise is added to a width that is
   * already anywhere in the range, so unclamped it can push a bank past the envelope the
   * silhouette drew — and the whole point of previewing the max is that the commit can only
   * come out *narrower* than the ground you cleared. Noise that would exceed it is spent
   * inward instead, which costs nothing visually: a bank pinned to the limit still wanders,
   * because the other one is free and they are independent.
   */
  const ceiling = Math.max(minWidth, maxWidth) / 2;
  const bank = (row: number) =>
    walk.map((half, i) =>
      Math.min(
        Math.max(half + bankNoise(noise, distances[i], half * 2, roughness, row), 0.5),
        ceiling,
      ),
    );

  return ribbonOutline(line, bank(0), bank(37));
}
