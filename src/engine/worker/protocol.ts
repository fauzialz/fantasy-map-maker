/**
 * Typed geometry-worker protocol (`04-geometry-pipeline.md` §"Worker message protocol").
 * Ops are coarse — one round-trip per user action; the pipeline stages stay inside the
 * worker. Add an op here and its handler in `geometry.worker.ts`; the client is generic.
 */
export interface GeometryOps {
  /** liveness/round-trip check. Real ops land with their packages: terrainCommit (WP-2/3),
   *  deriveRings (WP-4), generate (WP-10). */
  ping: { payload: { echo: string }; result: { echo: string } };
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
