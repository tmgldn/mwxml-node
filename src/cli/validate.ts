import { readFile } from "node:fs/promises";
import type { Json } from "../json.js";

type JsonDoc = { [key: string]: Json };

/**
 * Validates a stream of JSON revision documents against a JSON schema and
 * yields them when they validate — otherwise, complains noisily.
 */
export async function *validate(
  docs: AsyncIterable<JsonDoc>,
  schema: JsonDoc,
): AsyncGenerator<JsonDoc, void, void> {
  const { Ajv } = await import("ajv");
  const ajv = new Ajv({ strict: false, allErrors: true });
  const validateSchema = ajv.compile(schema);

  for await (const doc of docs) {
    if (!validateSchema(doc)) {
      throw new Error(
        `Revision document failed schema validation: ${
          ajv.errorsText(validateSchema.errors)
        }`,
      );
    }
    yield doc;
  }
}

/**
 * Loads a JSON schema from a file path.
 */
export async function loadSchema(path: string): Promise<JsonDoc> {
  return JSON.parse(await readFile(path, "utf8")) as JsonDoc;
}
