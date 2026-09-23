/**
 * JSON value type used by the `toJSON()` methods of the data model classes.
 */
export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

/**
 * Converts a value to a JSON-serializable type, mirroring the semantics of
 * Python's `jsonable` library:
 *
 * - Primitives pass through.
 * - Objects with a `toJSON()` method are serialized through it.
 * - Arrays and Sets become arrays.
 *
 * Note that, unlike `jsonable.Type.toJSON()` (which drops `null` values at the
 * top level of each object), `null` values *inside* arrays are preserved.
 */
export function jsonValue(value: unknown): Json {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(jsonValue);
  }

  if (value instanceof Set) {
    return [...value].map(jsonValue);
  }

  if (
    typeof value === "object" &&
    "toJSON" in value &&
    typeof (value as { toJSON: unknown }).toJSON === "function"
  ) {
    return (value as { toJSON: () => Json }).toJSON();
  }

  throw new TypeError(`${typeof value} is not JSON serializable.`);
}
