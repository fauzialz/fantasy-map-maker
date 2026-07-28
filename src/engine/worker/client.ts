import type { Op, Payload, Result, WorkerRequest, WorkerResponse } from "./protocol";

let worker: Worker | undefined;
const pending = new Map<
  string,
  { resolve: (value: never) => void; reject: (err: Error) => void }
>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./geometry.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const { id } = event.data;
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      if (event.data.ok) entry.resolve(event.data.result as never);
      else entry.reject(new Error(event.data.error));
    };
  }
  return worker;
}

/** Send one geometry op to the worker. Heavy work never runs on the main thread. */
export function callGeometry<O extends Op>(op: O, payload: Payload<O>): Promise<Result<O>> {
  const request: WorkerRequest<O> = { id: crypto.randomUUID(), op, payload };
  return new Promise<Result<O>>((resolve, reject) => {
    pending.set(request.id, { resolve: resolve as (value: never) => void, reject });
    getWorker().postMessage(request);
  });
}
