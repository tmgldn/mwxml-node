import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";

import type { Dump } from "./dump.js";
import { Channel } from "./map.js";

/**
 * A dump processing function that runs inside a worker thread: takes the
 * `Dump` loaded from a path and yields results.  Values are transferred to
 * the main thread via structured clone, so they must be cloneable (plain
 * JSON data always is).
 */
export type WorkerDumpProcessor<T> = (
  dump: Dump,
  path: string,
) => AsyncIterable<T>;

export interface MapWorkerOptions {
  /**
   * The name of the processor module export to run.  [default: "default"]
   */
  export?: string;

  /**
   * URL of the library module the workers import `Dump` from.  Defaults to
   * this package's compiled `dump.js`, resolved relative to this module.
   */
  libUrl?: string | URL;
}

/**
 * The code each worker runs: imports the library (for `Dump`) and the
 * processor module, then processes its assigned paths, posting each yielded
 * value (and the path's completion or failure) back to the main thread.
 * Runs as a plain-JavaScript eval string so that no separate bootstrap file
 * has to be built and shipped.
 */
const BOOTSTRAP = `
const { parentPort, workerData } = require("node:worker_threads");
(async () => {
  const lib = await import(workerData.libUrl);
  const mod = await import(workerData.processorUrl);
  const process = mod[workerData.exportName];
  for (const job of workerData.jobs) {
    try {
      const dump = await lib.Dump.fromFile(job.path);
      for await (const value of process(dump, job.path)) {
        parentPort.postMessage({ type: "value", index: job.index, value });
      }
      parentPort.postMessage({ type: "done", index: job.index });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      parentPort.postMessage({ type: "error", index: job.index, message, stack });
    }
  }
  parentPort.close();
})();
`;

type WorkerMessage<T> =
  | { type: "value"; index: number; value: T }
  | { type: "done"; index: number }
  | { type: "error"; index: number; message: string; stack?: string };

/**
 * Implements a strategy for processing XML dump files across real worker
 * threads (`node:worker_threads`), so that several dumps parse in parallel
 * on separate cores.  Because functions cannot cross a thread boundary, the
 * processor is given as a module URL (or absolute path) exporting a
 * `WorkerDumpProcessor`.  Like `map()`, results are yielded in the order the
 * paths were given and errors raised by a processor surface when its path's
 * results are reached.  Paths must be real files; streams cannot cross a
 * thread boundary.
 *
 * ```ts
 * import { mapWorker } from "node-mwxml";
 *
 * // processor.mjs: export default async function* (dump, path) { ... }
 * const processor = new URL("./processor.mjs", import.meta.url);
 *
 * for await (const doc of mapWorker(processor, files)) {
 *   console.log(doc);
 * }
 * ```
 */
export async function *mapWorker<T>(
  processor: string | URL,
  paths: string[],
  threads?: number,
  options: MapWorkerOptions = {},
): AsyncGenerator<T, void, void> {
  const limit = threads ?? availableParallelism();
  const count = Math.max(1, Math.min(limit, paths.length));
  const channels = paths.map(() => new Channel<T>());
  const libUrl = (
    options.libUrl ?? new URL("./dump.js", import.meta.url)
  ).toString();
  const processorUrl = processor instanceof URL ? processor.href : processor;
  const exportName = options.export ?? "default";

  const buckets: { index: number; path: string }[][] = Array.from(
    { length: count },
    () => [],
  );
  paths.forEach((path, index) => {
    buckets[index % count].push({ index, path });
  });

  const workers: Worker[] = [];
  for (const jobs of buckets) {
    if (jobs.length === 0) continue;
    const pending = new Set(jobs.map((job) => job.index));
    const worker = new Worker(BOOTSTRAP, {
      eval: true,
      workerData: { libUrl, processorUrl, exportName, jobs },
    });
    workers.push(worker);
    worker.on("message", (message: WorkerMessage<T>) => {
      const channel = channels[message.index];
      pending.delete(message.index);
      if (message.type === "value") {
        channel.push(message.value);
      } else if (message.type === "done") {
        channel.finish();
      } else {
        const error = new Error(message.message);
        error.stack = message.stack;
        channel.fail(error);
      }
    });
    worker.on("error", (error) => {
      for (const job of jobs) {
        channels[job.index].fail(error);
      }
    });
    worker.on("exit", () => {
      for (const index of pending) {
        channels[index].fail(
          new Error("Worker exited before finishing its path."),
        );
      }
    });
  }

  try {
    for (const channel of channels) {
      for (;;) {
        const result = await channel.next();
        if (result.done) break;
        yield result.value;
      }
    }
  } finally {
    // Terminating the workers is only strictly necessary when the iteration
    // is abandoned early; it is a harmless no-op on already-exited workers.
    for (const worker of workers) {
      void worker.terminate();
    }
  }
}
