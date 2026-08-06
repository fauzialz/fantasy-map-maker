/**
 * Sprite path data → polygon rings.
 *
 * The sprites are authored as SVG path `d` strings (`registry.ts`), and two things need
 * them as geometry: the drawn extent, and the silhouette hit-test (ADR-30). Both must work
 * in Node — bounds are unit-tested without a canvas (`07` §4, `10` P4) — so this is
 * arithmetic over the string rather than a `Path2D` probe.
 *
 * **The accepted dialect is absolute `M`/`L`/`Q`/`Z`, and anything else throws.** That is
 * the whole point of the module. What this replaces took the min/max of *every number in
 * the string*, which is correct only while every number is an absolute x,y coordinate: it
 * mis-measured relative commands, arcs and `H`/`V` shorthand without a word, and that is
 * precisely what a design tool exports by default. A loud failure at asset-swap time beats
 * "selection feels off" discovered months later (ADR-30 F5, `HOW-TO-CHANGE-SPRITE-ART.md`).
 *
 * The same regex is also why the old boxes were loose — it counted **Bézier control
 * points** as if they were on the curve, and a quadratic never reaches its control point.
 * Flattening tightens every box for free.
 */

export type PathRing = [number, number][];

/**
 * Segments per quadratic.
 *
 * ponytail: a fixed count, not adaptive subdivision. Flattening error is bounded by
 * |P0 − 2P1 + P2| / 8n², so a curve spanning the whole 100-unit grid is off by ~0.05 units
 * here — forty times under `STROKE_PAD`, and invisible against artwork drawn to integers.
 * Go adaptive only if a sprite ever needs a curve much larger than its own grid.
 */
const CURVE_STEPS = 16;

const SUPPORTED = new Set(["M", "L", "Q", "Z"]);
const isCommand = (token: string) => /[A-Za-z]/.test(token);

/**
 * Walk a path into closed rings of points, flattening every curve.
 *
 * Subpaths become separate rings — a tree's trunk and its foliage are two — and rings of
 * fewer than three points are dropped, so an open polyline like a `detail` stroke parses
 * cleanly and simply contributes no area.
 */
export function pathRings(d: string): PathRing[] {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+/g) ?? [];
  const rings: PathRing[] = [];
  let ring: PathRing = [];
  let cx = 0;
  let cy = 0;
  let i = 0;

  const close = () => {
    if (ring.length >= 3) rings.push(ring);
    ring = [];
  };

  const number = () => {
    const token = tokens[i++];
    if (token === undefined || isCommand(token)) {
      throw new Error(`sprite path: "${d}" ends mid-command, expected a number`);
    }
    return Number(token);
  };

  while (i < tokens.length) {
    const command = tokens[i];
    if (!isCommand(command)) {
      throw new Error(`sprite path: "${d}" has a number where a command was expected`);
    }
    if (!SUPPORTED.has(command)) {
      throw new Error(
        `sprite path: unsupported command "${command}" in "${d}". Only absolute M, L, Q and Z ` +
          `are supported — convert relative commands, arcs and H/V shorthand to those before ` +
          `adding artwork (see HOW-TO-CHANGE-SPRITE-ART.md).`,
      );
    }
    i++;

    if (command === "Z") {
      close();
      continue;
    }

    // Operands repeat until the next command: "L 1 2 3 4" is two line segments, and the
    // pairs after an M are line segments too, per SVG.
    let first = true;
    do {
      if (command === "M" && first) {
        close();
        cx = number();
        cy = number();
        ring = [[cx, cy]];
      } else if (command === "Q") {
        const qx = number();
        const qy = number();
        const x = number();
        const y = number();
        for (let step = 1; step <= CURVE_STEPS; step++) {
          const t = step / CURVE_STEPS;
          const u = 1 - t;
          ring.push([
            u * u * cx + 2 * u * t * qx + t * t * x,
            u * u * cy + 2 * u * t * qy + t * t * y,
          ]);
        }
        cx = x;
        cy = y;
      } else {
        cx = number();
        cy = number();
        ring.push([cx, cy]);
      }
      first = false;
    } while (i < tokens.length && !isCommand(tokens[i]));
  }

  close();
  return rings;
}
