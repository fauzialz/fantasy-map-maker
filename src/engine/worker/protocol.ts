import type { Landmass } from "../../scene/types";
import type { GenerateRequest, GenerateResult } from "../generator/generate";
import type { DeriveTerrain, DerivedTerrain } from "../water/derive";
import type { ResolveDrop, DropResult } from "../terrain/overlap";
import type { TerrainCommit } from "../terrain/pipeline";

/**
 * Typed geometry-worker protocol (`04-geometry-pipeline.md` §"Worker message protocol").
 * Ops are coarse — one round-trip per user action; the pipeline stages stay inside the
 * worker. Add an op here and its handler in `geometry.worker.ts`; the client is generic.
 */
export interface GeometryOps {
  /** liveness/round-trip check */
  ping: { payload: { echo: string }; result: { echo: string } };
  /** Pipeline A: one committed brush stroke → the new set of landmasses */
  terrainCommit: { payload: TerrainCommit; result: { landmasses: Landmass[] } };
  /**
   * WP-40: the two-collection derivation — the drawn land (`union(land) − union(water)`)
   * and Pipeline C's bands, which grow from that same cut boundary. One op because both
   * halves need the water union and the cut, and coarse ops are the rule here.
   */
  deriveTerrain: { payload: DeriveTerrain; result: DerivedTerrain };
  /** Pipeline B: noise fields → mask → terrain → biomes → scatter, all in one round-trip. */
  generate: { payload: GenerateRequest; result: GenerateResult };
  /** WP-15: what a dragged landmass does when it lands on another (C1 must hold at rest). */
  resolveDrop: { payload: ResolveDrop; result: DropResult };
}

export type Op = keyof GeometryOps;
export type Payload<O extends Op> = GeometryOps[O]["payload"];
export type Result<O extends Op> = GeometryOps[O]["result"];

export interface WorkerRequest<O extends Op = Op> {
  id: string;
  op: O;
  payload: Payload<O>;
}

export type WorkerResponse<O extends Op = Op> =
  { id: string; ok: true; result: Result<O> } | { id: string; ok: false; error: string };
