import type { Json } from "../json.js";
import type { Dump } from "../dump.js";

/**
 * Converts a dump into a stream of revision JSON documents.
 */
export async function *dump2revdocs(
  dump: Dump,
  verbose = false,
): AsyncGenerator<Json, void, void> {
  for await (const page of dump.pages) {
    if (verbose) {
      process.stderr.write(`${page.title ?? ""}: `);
    }

    for await (const revision of page) {
      yield revision.toJSON();

      if (verbose) {
        process.stderr.write(".");
      }
    }

    if (verbose) {
      process.stderr.write("\n");
    }
  }
}
