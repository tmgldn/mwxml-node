import { createReadStream, createWriteStream } from "node:fs";
import { Readable, type Writable } from "node:stream";
import { homedir } from "node:os";
import { statSync } from "node:fs";
import { join } from "node:path";
import { createGunzip, createGzip } from "node:zlib";

/**
 * Any readable source of dump data: a Node stream, an async iterable of
 * chunks or a string of XML.
 */
export type InputStream = AsyncIterable<Buffer | string> | NodeJS.ReadableStream;

/**
 * Reads a file path and returns the filename without its extension and the
 * extension itself (or `null` if the path contains no extension).
 */
export function extractExtension(path: string): [string, string | null] {
  const filename = path.split("/").pop() as string;
  const parts = filename.split(".");
  if (parts.length === 1) {
    return [filename, null];
  }
  return [parts.slice(0, -1).join("."), parts[parts.length - 1]];
}

/**
 * Verifies that a file exists at a given path and returns the expanded
 * path.  Streams (and other async iterables) are passed through unchanged.
 */
export function normalizePath(
  pathOrStream: string | InputStream,
): string | InputStream {
  if (typeof pathOrStream !== "string") {
    return pathOrStream;
  }
  const path = pathOrStream.startsWith("~")
    ? join(homedir(), pathOrStream.slice(1))
    : pathOrStream;

  const stats = statSync(path, { throwIfNoEntry: false });
  if (stats === undefined) {
    const error = new Error(`No such file: ${path}`);
    (error as NodeJS.ErrnoException).code = "ENOENT";
    throw error;
  } else if (stats.isDirectory()) {
    const error = new Error(`Is a directory: ${path}`);
    (error as NodeJS.ErrnoException).code = "EISDIR";
    throw error;
  }
  return path;
}

async function *decompress(stream: Readable): AsyncGenerator<Buffer> {
  const iterator = stream[Symbol.asyncIterator]();
  const first = await iterator.next();
  if (first.done) {
    return;
  }
  const firstChunk = Buffer.isBuffer(first.value)
    ? first.value
    : Buffer.from(first.value);

  if (
    firstChunk.length >= 2 &&
    firstChunk[0] === 0x1f &&
    firstChunk[1] === 0x8b
  ) {
    // gzip (magic bytes 1f 8b)
    const source = Readable.from(
      (async function *() {
        yield firstChunk;
        yield * iterator;
      })(),
    );
    const piped = source.pipe(createGunzip()) as Readable;
    yield * piped;
  } else if (
    firstChunk.length >= 3 &&
    firstChunk[0] === 0x42 &&
    firstChunk[1] === 0x5a &&
    firstChunk[2] === 0x68
  ) {
    // bzip2 (magic bytes "BZh")
    let unbzip2;
    try {
      unbzip2 = (await import("unbzip2-stream")).default;
    } catch {
      throw new Error(
        "Cannot decompress bzip2: the optional dependency " +
          "'unbzip2-stream' is not installed.  Install it with " +
          "'npm install unbzip2-stream'.",
      );
    }
    const source = Readable.from(
      (async function *() {
        yield firstChunk;
        yield * iterator;
      })(),
    );
    const piped = source.pipe(unbzip2()) as Readable;
    yield * fromLegacyStream(piped);
  } else {
    yield firstChunk;
    yield * iterator;
  }
}

/**
 * Adapts a legacy (non-async-iterable) readable stream into an async
 * iterable of buffers.  Needed because `unbzip2-stream` returns an
 * old-style `through` stream.
 */
async function *fromLegacyStream(
  stream: NodeJS.ReadableStream,
): AsyncGenerator<Buffer> {
  const chunks: Buffer[] = [];
  let ended = false;
  let failure: { error: Error } | null = null;
  let wake: (() => void) | null = null;

  stream.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
    wake?.();
  });
  stream.on("end", () => {
    ended = true;
    wake?.();
  });
  stream.on("error", (error: Error) => {
    failure = { error };
    ended = true;
    wake?.();
  });

  for (;;) {
    if (chunks.length > 0) {
      yield chunks.shift() as Buffer;
    } else if (failure !== null) {
      // The cast works around TypeScript's narrowing, which cannot see the
      // assignment made inside the "error" callback above.
      throw (failure as { error: Error }).error;
    } else if (ended) {
      return;
    } else {
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
  }
}

/**
 * Turns a path to a (possibly compressed) file into an async iterable of
 * decompressed chunks.  Compression is detected by sniffing the file's
 * magic bytes: gzip (via `node:zlib`) and bzip2 (via the optional
 * `unbzip2-stream` dependency).  Streams and async iterables are passed
 * through unchanged.
 */
export async function *reader(
  pathOrStream: string | InputStream,
): AsyncGenerator<Buffer | string> {
  if (typeof pathOrStream !== "string") {
    yield * pathOrStream as AsyncIterable<Buffer | string>;
    return;
  }
  const path = normalizePath(pathOrStream) as string;
  yield * decompress(createReadStream(path));
}

/**
 * Performs a streaming concatenation of strings and/or streams.
 */
export function concat(...items: (string | InputStream)[]): Readable {
  return Readable.from(
    (async function *() {
      for (const item of items) {
        if (typeof item === "string") {
          yield item;
        } else {
          yield * item as AsyncIterable<Buffer | string>;
        }
      }
    })(),
  );
}

/**
 * Creates a (possibly compressed) file writer for a path.  Paths ending in
 * `.gz` are gzipped; bzip2 compression is not supported (unlike the Python
 * library, which uses it as the default for CLI output).
 */
export function writer(path: string): Writable {
  const [, extension] = extractExtension(path);
  if (extension === "gz") {
    const gzip = createGzip();
    const output = createWriteStream(path);
    gzip.pipe(output);
    return gzip;
  }
  return createWriteStream(path);
}
