declare module "polygon-offset" {
  /**
   * Minimal surface for what the ring pipeline uses. The library ships no types.
   * `data()` accepts a ring, a polygon-with-holes, or a multipolygon; every variant
   * returns a FLAT list of linear rings with the winding inverted — see
   * `groupRingsByNesting` for why the result has to be regrouped by containment.
   */
  export default class Offset {
    data(input: number[][][] | number[][] | number[][][][]): Offset;
    arcSegments(segments: number): Offset;
    margin(distance: number): number[][][];
    padding(distance: number): number[][][];
    offset(distance: number): number[][][];
  }
}
