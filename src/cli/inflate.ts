import type { Json } from "../json.js";

/**
 * Inflates a single flat document into a hierarchical one by splitting
 * each key on underscores and nesting the resulting parts.
 */
export function singleInflate(
  flat: { [key: string]: Json },
): { [key: string]: Json } {
  const inflated: { [key: string]: Json } = {};
  for (const key of Object.keys(flat)) {
    let bottom = inflated;
    const parts = key.split("_");
    for (const subKey of parts.slice(0, -1)) {
      if (!(subKey in bottom) || typeof bottom[subKey] !== "object" ||
          bottom[subKey] === null || Array.isArray(bottom[subKey])) {
        bottom[subKey] = {};
      }
      bottom = bottom[subKey] as { [key: string]: Json };
    }
    bottom[parts[parts.length - 1]] = flat[key];
  }
  return inflated;
}

/**
 * Converts a stream of flat revision JSON documents into hierarchical ones.
 */
export async function *inflate(
  flatJsons: AsyncIterable<{ [key: string]: Json }>,
): AsyncGenerator<{ [key: string]: Json }, void, void> {
  for await (const flatJson of flatJsons) {
    yield singleInflate(flatJson);
  }
}
