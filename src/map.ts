import { availableParallelism } from "node:os";

import { Dump } from "./dump.js";
import { normalizePath, reader, type InputStream } from "./files.js";

/**
 * A dump processing function: takes a `Dump` and the path (or stream) it was
 * loaded from and yields results.
 */
export type DumpProcessor<T> = (
  dump: Dump,
  path: string | InputStream,
) => AsyncIterable<T>;

/**
 * A minimal counting semaphore: at most `limit` holders run at a time;
 * further acquirers queue until a holder releases.
 */
class Semaphore {
  private active = 0;
  private waiters: (() => void)[] = [];

  constructor(readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError(
        `Concurrency limit must be a positive integer, got ${limit}`,
      );
    }
  }

  async acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
    this.active += 1;
  }

  release(): void {
    this.active -= 1;
    const next = this.waiters.shift();
    if (next !== undefined) next();
  }
}

/**
 * A pull-based channel that buffers the results produced for a single path.
 * Buffered values are yielded first; once the buffer is drained, a failed
 * run rejects and a completed run reports `done`.
 */
class Channel<T> {
  private values: T[] = [];
  private waiters: {
    resolve: (result: IteratorResult<T>) => void;
    reject: (error: unknown) => void;
  }[] = [];
  private done = false;
  private failure: { error: unknown } | null = null;

  push(value: T): void {
    this.values.push(value);
    this.settle();
  }

  finish(): void {
    this.done = true;
    this.settle();
  }

  fail(error: unknown): void {
    this.failure = { error };
    this.done = true;
    this.settle();
  }

  next(): Promise<IteratorResult<T>> {
    return new Promise((resolve, reject) => {
      if (this.values.length > 0) {
        resolve({ value: this.values.shift() as T, done: false });
      } else if (this.failure !== null) {
        reject(this.failure.error);
      } else if (this.done) {
        resolve({ value: undefined as never, done: true });
      } else {
        this.waiters.push({ resolve, reject });
      }
    });
  }

  private settle(): void {
    while (
      this.waiters.length > 0 &&
      (this.values.length > 0 || this.done)
    ) {
      const waiter = this.waiters.shift() as {
        resolve: (result: IteratorResult<T>) => void;
        reject: (error: unknown) => void;
      };
      if (this.values.length > 0) {
        waiter.resolve({ value: this.values.shift() as T, done: false });
      } else if (this.failure !== null) {
        waiter.reject(this.failure.error);
      } else {
        waiter.resolve({ value: undefined as never, done: true });
      }
    }
  }
}

/**
 * Implements a strategy for processing XML dump files in parallel.  Each
 * path is processed through `process` (concurrently, gated by `threads`)
 * and the results are yielded in the order the paths were given.  Errors
 * raised by a processor surface when its path's results are reached.
 *
 * ```ts
 * import { map } from "node-mwxml";
 *
 * const files = ["examples/dump.xml", "examples/dump2.xml"];
 *
 * async function *pageInfo(dump, path) {
 *   for await (const page of dump) {
 *     yield [page.id, page.namespace, page.title];
 *   }
 * }
 *
 * for await (const [id, namespace, title] of map(pageInfo, files)) {
 *   console.log(id, namespace, title);
 * }
 * ```
 */
export async function *map<T>(
  process: DumpProcessor<T>,
  paths: (string | InputStream)[],
  threads?: number,
): AsyncGenerator<T, void, void> {
  const semaphore = new Semaphore(threads ?? availableParallelism());
  const normalizedPaths = paths.map((path) => normalizePath(path));

  const channels = normalizedPaths.map((path) => {
    const channel = new Channel<T>();

    void (async () => {
      await semaphore.acquire();
      try {
        const dump = await Dump.fromFile(
          typeof path === "string" ? reader(path) : path,
        );
        for await (const value of process(dump, path)) {
          channel.push(value);
        }
        channel.finish();
      } catch (error) {
        channel.fail(error);
      } finally {
        semaphore.release();
      }
    })();

    return channel;
  });

  for (const channel of channels) {
    for (;;) {
      const result = await channel.next();
      if (result.done) break;
      yield result.value;
    }
  }
}
