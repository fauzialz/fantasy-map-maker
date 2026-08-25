import { createNoise2D } from "simplex-noise";
import type { Point } from "../../scene/types";
import { mulberry32 } from "../generator/fields";
import type { Ring } from "../geometry/types";
import { EPSILON_DETAILED, simplifyTo } from "../terrain/smooth";

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

/**
 * The clicked points become a centreline: **straight between corners, a real curve through them.**
 *
 * `bend` runs 0…1: **straight at 0, flowing at 1.** Up to the halfway mark it is a share of the
 * legs either side of each corner — the course runs dead straight up to that anchor, through a
 * quadratic Bézier with the clicked point as its control, and dead straight out again. Half a
 * leg is where that runs out, because past the midpoint a corner's curve would begin before its
 * neighbour's had ended and the course would run forward, jump back down the leg and run forward
 * again (measured as a full −1.0 reversal between consecutive segments). Above the halfway mark
 * the corners stay fully bent and the guide relaxes instead — see `relax`. The Bézier is **tangent to both legs at its
 * ends**, so the joins are smooth and the whole thing reads as one curve rather than a corner
 * with a rounded lid.
 *
 * **That tangency is what makes the number on the slider true**, which is the reason this is a
 * Bézier and not corner-cutting. Chaikin was used here first, with the anchors as its input —
 * but chaikin rounds *every* vertex, including the anchors, so the curve spilled past them and
 * the straight run was far shorter than the setting claimed. Measured on a right angle: at a
 * setting of **50% the course left the straight line at 90.6% of the leg**, so the bend occupied
 * the last ninth rather than the last half. The anchors were placed exactly where the label
 * said; nothing downstream respected them. A control that is off by a factor of five is the
 * defect `12-tools-that-say-what-they-do.md` opens with.
 *
 * | setting | 10% | 30% | 50% | 70% | 100% |
 * |---|---|---|---|---|---|
 * | where the bend used to start | 99.1% | 97.2% | 95.3% | 93.4% | 90.6% |
 * | where it starts now | 95% | 85% | 75% | 65% | 50% |
 *
 * Two things fell out of the change rather than being aimed at. The sweep at a given setting
 * roughly **doubled**, because the curve now uses the whole share it was given. And a 12-click
 * river dropped from 92 centreline points to **42**: a Bézier spends points only where the
 * course is actually turning, while corner-cutting subdivides the straights as well.
 *
 * At 100% the two anchors either end of a leg land on its midpoint and the curves meet there
 * exactly — no straight run left anywhere, which is the maximum and why the slider stops.
 */
export function centreline(points: Point[], bend: number): Point[] {
  const path = dedupe(points);
  if (path.length < 3) return path;
  const knob = Math.min(Math.max(bend, 0), 1);

  /**
   * **The knob is one continuum with two halves, and the halfway mark is the hinge.**
   *
   * Below it, a corner claims more and more of the legs either side — sharp at 0, meeting its
   * neighbour at the midpoint at 0.5, which is as far as that can go. Above it the corners stay
   * fully bent and the *guide itself* starts to relax, so the course stops running through the
   * clicked points and begins taking its own line past them. Two mechanisms, but they hand over
   * exactly where the first runs out, so the control reads as one thing: **straight at 0, and
   * flowing at 1.**
   *
   * At 0.5 the relaxation is zero and the course is precisely what the corner construction gives
   * on its own, so a user who pushes past the middle and does not like it gets the old shape back
   * by returning to it — not something approximately like it.
   */
  const share = Math.min(knob, 0.5);
  const slack = Math.max(knob - 0.5, 0) * 2;

  const guide = slack > 0 ? relax(relax(path, slack / 2), slack / 2) : path;

  const out: Point[] = [guide[0]];
  for (let i = 1; i < guide.length - 1; i++) {
    const a = guide[i - 1];
    const b = guide[i];
    const c = guide[i + 1];
    const into = towards(b, a, share);
    const outOf = towards(b, c, share);
    const steps = arcSteps(a, b, c);
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const u = 1 - t;
      out.push([
        u * u * into[0] + 2 * u * t * b[0] + t * t * outOf[0],
        u * u * into[1] + 2 * u * t * b[1] + t * t * outOf[1],
      ]);
    }
  }
  out.push(guide[guide.length - 1]);
  return out;
}

/**
 * Ease every interior point toward the midpoint of its neighbours, ends pinned.
 *
 * This is what "more bend than fully bent" has to mean, and there is no way around it: once a
 * corner already reaches the midpoint of both its legs, the only room left is for the course to
 * stop passing through the clicked points at all. Measured on a six-click path, the worst
 * distance between a click and the drawn course goes from **51 units at the hinge to 118 at the
 * top** — and it saturates there, which is why the top of the slider is two passes and not ten.
 */
const relax = (points: Point[], amount: number): Point[] =>
  points.map((point, i) => {
    if (i === 0 || i === points.length - 1) return point;
    const before = points[i - 1];
    const after = points[i + 1];
    return [
      point[0] + ((before[0] + after[0]) / 2 - point[0]) * amount,
      point[1] + ((before[1] + after[1]) / 2 - point[1]) * amount,
    ];
  });

/** The point a `share` of the way from `from` towards `to`. */
const towards = (from: Point, to: Point, share: number): Point => [
  from[0] + (to[0] - from[0]) * share,
  from[1] + (to[1] - from[1]) * share,
];

/**
 * How many segments the corner's curve is drawn with — more where it turns further, because
 * that is where a polyline shows its edges. A gentle kink needs three; a hairpin needs a dozen.
 */
function arcSteps(a: Point, b: Point, c: Point): number {
  let turn = Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]);
  while (turn > Math.PI) turn -= 2 * Math.PI;
  while (turn < -Math.PI) turn += 2 * Math.PI;
  return Math.min(Math.max(Math.round((Math.abs(turn) * 180) / Math.PI / 12), 3), 16);
}

/** Consecutive points closer together than this are one point. Well under a mask cell (2u). */
const COINCIDENT = 1e-6;

/**
 * **Coincident points are dropped first, and that is not defensive tidying** (WP-44). While the
 * pointer is still after a click, `useSplineTool` hands this the clicked path with its last
 * point repeated — `[…, p, p]` — because the rubber band's cursor *is* the point just laid. A
 * zero-length leg has no direction, so the corner built on it has no tangent and the banks
 * either side of it collapse onto the centreline.
 */
const dedupe = (points: Point[]): Point[] =>
  points.filter(
    (point, i) =>
      i === 0 || Math.hypot(point[0] - points[i - 1][0], point[1] - points[i - 1][1]) > COINCIDENT,
  );

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
  /**
   * **A degenerate tangent carries the last good one forward** (WP-44). The guard here used to
   * be `|| 1`, which divides by one rather than by zero — and so returns the zero *vector*
   * where a unit vector was wanted, silently collapsing both banks onto the centreline. Nothing
   * should reach this now that `centreline` dedupes, but a zero normal is a pinch that looks
   * like a rendering bug rather than bad input, so the guard says what it means.
   */
  let nx = 0;
  let ny = 0;
  for (let i = 0; i < line.length; i++) {
    const [ax, ay] = line[Math.max(i - 1, 0)];
    const [bx, by] = line[Math.min(i + 1, line.length - 1)];
    const length = Math.hypot(bx - ax, by - ay);
    if (length > 0) {
      nx = -(by - ay) / length;
      ny = (bx - ax) / length;
    }
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
export function previewRibbon(points: Point[], maxWidth: number, bend: number): Ring {
  const line = centreline(points, bend);
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
  bend: number,
): Ring {
  const line = centreline(points, bend);
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

  /**
   * **Kept at `EPSILON_DETAILED`** — the finest tolerance this app uses anywhere, and no
   * coarser, because both of this function's features live above it: the width walk moves the
   * banks by `(maxWidth − minWidth) / 2` and the noise by more again. It exists to shed the
   * collinear runs the subdivision leaves along the straights, not to smooth the river.
   */
  return simplifyTo(ribbonOutline(line, bank(0), bank(37)), EPSILON_DETAILED);
}
