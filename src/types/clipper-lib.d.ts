declare module "clipper-lib" {
  /**
   * Minimal surface for what the ring pipeline uses. Clipper is an integer library —
   * every coordinate handed to it is already scaled (see `geometry/coords.ts`).
   */
  export interface IntPoint {
    X: number;
    Y: number;
  }
  export type Path = IntPoint[];
  export type Paths = Path[];

  class ClipperOffset {
    constructor(miterLimit?: number, arcTolerance?: number);
    AddPaths(paths: Paths, joinType: number, endType: number): void;
    /** Offsets every added path by `delta`; positive grows, negative shrinks. */
    Execute(solution: Paths, delta: number): void;
    Clear(): void;
  }

  const ClipperLib: {
    ClipperOffset: typeof ClipperOffset;
    JoinType: { jtSquare: number; jtRound: number; jtMiter: number };
    EndType: {
      etClosedPolygon: number;
      etClosedLine: number;
      etOpenbutt: number;
      etOpenSquare: number;
      etOpenRound: number;
    };
  };

  export default ClipperLib;
}
