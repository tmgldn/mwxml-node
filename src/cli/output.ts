import { mkdirSync } from "node:fs";
import { basename } from "node:path";
import type { Writable } from "node:stream";

import { extractExtension, writer } from "../files.js";
import type { Json } from "../json.js";

/**
 * Opens the output for a single input path: stdout when no output directory
 * is given, otherwise a (possibly gzipped) file named after the input
 * inside the output directory.
 */
export function openOutput(
  output: string | undefined,
  compress: string | undefined,
  input: string,
): Writable {
  if (output === undefined) {
    return process.stdout;
  }
  mkdirSync(output, { recursive: true });
  const [filename] = extractExtension(basename(input));
  const extension = compress === "gz" ? ".gz" : "";
  const path = `${output}/${filename}${extension}`;
  return writer(path);
}

/**
 * Writes JSON documents to a stream, one per line, and ends the stream
 * (unless it is stdout).
 */
export async function writeAll(
  docs: AsyncIterable<Json>,
  output: Writable,
): Promise<void> {
  const write = (chunk: string) =>
    new Promise<void>((resolve, reject) => {
      output.write(chunk, (error) =>
        error === null || error === undefined ? resolve() : reject(error),
      );
    });

  for await (const doc of docs) {
    await write(`${JSON.stringify(doc)}\n`);
  }

  if (output !== process.stdout) {
    await new Promise<void>((resolve, reject) => {
      output.end((error?: Error | null) =>
        error ? reject(error) : resolve(),
      );
    });
  }
}
