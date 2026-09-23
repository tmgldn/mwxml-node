import { ElementIterator } from "../elementIterator.js";
import { consumeTags, noneOr, pyStr } from "../util.js";
import type { Json } from "../json.js";

/**
 * Contributing user metadata.
 *
 * - `id`: the contributing user's identifier (`null` for logged-out users).
 * - `text`: username or IP address of the user at the time of the edit.
 */
export class User {
  readonly id: number | null;
  readonly text: string | null;

  constructor(id: number | null = null, text: string | null = null) {
    this.id = noneOr(id, Number);
    this.text = noneOr(text, String);
  }

  toJSON(): Json {
    const doc: { [key: string]: Json } = {};
    if (this.id !== null) doc.id = this.id;
    if (this.text !== null) doc.text = this.text;
    return doc;
  }

  static async fromElement(element: ElementIterator): Promise<User> {
    const tagMap = new Map<
      string,
      (element: ElementIterator) => Promise<unknown>
    >();

    // Python quirk kept for compatibility: an empty <id> tag yields 0
    // and an empty <username> tag yields the string "None"
    // (from Python's `str(None)`).
    tagMap.set("id", async (e: ElementIterator) => {
      const text = await e.text();
      return text === null ? 0 : Number(text);
    });
    tagMap.set("username", async (e: ElementIterator) =>
      pyStr(await e.text()),
    );
    tagMap.set("ip", async (e: ElementIterator) => pyStr(await e.text()));

    const values = await consumeTags(tagMap, element);

    const id = (values.get("id") as number | undefined) ?? null;
    const text = values.has("username")
      ? (values.get("username") as string | null)
      : ((values.get("ip") as string | undefined) ?? null);

    return new User(id, text);
  }
}
