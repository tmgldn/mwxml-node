import { ElementIterator } from "../elementIterator.js";
import { noneOr } from "../util.js";
import type { Json } from "../json.js";

export interface NamespaceOptions {
  canonical?: string | null;
  aliases?: string[] | null;
  case?: string | null;
  content?: boolean | null;
}

/**
 * Namespace metadata.
 */
export class Namespace {
  readonly id: number;
  readonly name: string;
  readonly aliases: string[] | null;
  readonly case: string | null;
  readonly canonical: string | null;
  readonly content: boolean | null;

  constructor(
    id: number | string,
    name: string,
    options: NamespaceOptions = {},
  ) {
    if (id === null || id === undefined) {
      // Python's int(None) raises a TypeError; mirror that here.
      throw new TypeError("Namespace id must not be null");
    }
    this.id = Number(id);
    this.name = String(name);
    this.aliases = noneOr(options.aliases, (v) => [...v]);
    this.case = noneOr(options.case, String);
    this.canonical = noneOr(options.canonical, String);
    this.content = noneOr(options.content, Boolean);
  }

  toJSON(): Json {
    const doc: { [key: string]: Json } = { id: this.id, name: this.name };
    if (this.aliases !== null) doc.aliases = [...this.aliases].sort();
    if (this.case !== null) doc.case = this.case;
    if (this.canonical !== null) doc.canonical = this.canonical;
    if (this.content !== null) doc.content = this.content;
    return doc;
  }

  static async fromElement(element: ElementIterator): Promise<Namespace> {
    const text = await element.text();
    return new Namespace(
      element.attr("key") as string,
      text ?? "",
      { case: element.attr("case") },
    );
  }
}
