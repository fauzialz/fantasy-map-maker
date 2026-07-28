/// <reference lib="webworker" />
import { terrainCommit } from "../terrain/pipeline";
import type { GeometryOps, Op, WorkerRequest, WorkerResponse } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

type Handlers = { [O in Op]: (payload: GeometryOps[O]["payload"]) => GeometryOps[O]["result"] };

const handlers: Handlers = {
  ping: (payload) => payload,
  terrainCommit: (payload) => ({ landmasses: terrainCommit(payload) }),
};

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, op, payload } = event.data;
  let response: WorkerResponse;
  try {
    const handler = handlers[op];
    if (!handler) throw new Error(`Unknown op: ${op}`);
    response = { id, ok: true, result: handler(payload as never) };
  } catch (err) {
    response = { id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  self.postMessage(response);
};
