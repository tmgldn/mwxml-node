import type { ElementIterator } from "./elementIterator.js";

/**
 * Mirrors Python's `mwtypes.util.none_or`: returns `null` when the value is
 * `null`/`undefined`, otherwise coerces it with the given function.
 */
export function noneOr<T, R>(
  value: T | null | undefined,
  coerce: (value: T) => R,
): R | null {
  return value === null || value === undefined ? null : coerce(value);
}

/**
 * Consumes the sub-elements of an element for which a handler is registered
 * and returns a map from tag name to the handler's result.
 */
export async function consumeTags(
  tagMap: Map<string, (element: ElementIterator) => Promise<unknown>>,
  element: ElementIterator,
): Promise<Map<string, unknown>> {
  const valueMap = new Map<string, unknown>();
  for await (const subElement of element) {
    const handler = tagMap.get(subElement.tag);
    if (handler !== undefined) {
      valueMap.set(subElement.tag, await handler(subElement));
    }
  }
  return valueMap;
}

/**
 * Pulls a single value from an async iterable without closing it.  This is
 * the async equivalent of Python's `next()` over a shared iterator: the
 * underlying generator stays suspended and can be resumed later.  Returns
 * `null` when the iterable is exhausted.
 */
export async function nextItem<T>(
  iterable: AsyncIterable<T>,
): Promise<T | null> {
  const iterator = iterable[Symbol.asyncIterator]();
  const result = await iterator.next();
  return result.done || result.value === undefined ? null : result.value;
}

/**
 * An async iterable that yields nothing.
 */
export function emptyAsyncIterable<T>(): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      // yields nothing
    },
  };
}

/**
 * Mirrors Python's `str(x)`: `str(None)` is `"None"`.
 */
export function pyStr(value: string | null): string {
  return value === null ? "None" : String(value);
}
