import type { Landmass } from "../../scene/types";
import type { GenerateRequest, GenerateResult } from "../generator/generate";
import type { MultiPolygon } from "../geometry/types";
import type { DeriveRings } from "../rings/rings";
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
  /** Pipeline C: land union -> water -> bands -> clip. One MultiPolygon per ring. */
  deriveRings: { payload: DeriveRings; result: { bands: MultiPolygon[] } };
  /** Pipeline B: noise fields → mask → terrain → biomes → scatter, all in one round-trip. */
  generate: { payload: GenerateRequest; result: GenerateResult };
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
