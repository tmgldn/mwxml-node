import { parentPort, workerData } from "node:worker_threads";

import { Dump } from "../dump.js";
import { dump2revdocs } from "./dump2revdocs.js";
import { openOutput, writeAll } from "./output.js";

/**
 * The worker entry of `dump2revdocs --threads=<num>`: converts each assigned
 * input path to a revision document file inside the output directory,
 * reporting per-path completion or failure to the parent thread.
 */
const { paths, output, compress, verbose } = workerData as {
  paths: string[];
  output: string;
  compress?: string;
  verbose: boolean;
};

for (const path of paths) {
  try {
    const dump = await Dump.fromFile(path);
    const stream = openOutput(output, compress, path);
    await writeAll(dump2revdocs(dump, verbose), stream);
    parentPort?.postMessage({ type: "done", path });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    parentPort?.postMessage({ type: "error", path, message });
  }
}
