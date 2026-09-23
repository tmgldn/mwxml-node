import { MalformedXML } from "../errors.js";
import { ElementIterator } from "../elementIterator.js";
import { noneOr } from "../util.js";
import type { Json } from "../json.js";

export interface ContentOptions {
  role?: string | null;
  origin?: number | string | null;
  model?: string | null;
  format?: string | null;
  deleted?: boolean | null;
  id?: string | null;
  location?: string | null;
  bytes?: number | string | null;
  sha1?: string | null;
  text?: string | null;
}

/**
 * Content metadata and text.
 *
 * Note the deliberate coercion quirks inherited from the Python library:
 * `origin` and `bytes` are numeric while `id` is a string, and an empty
 * text tag serializes as `null`.
 */
export class Content {
  readonly role: string | null;
  readonly origin: number | null;
  readonly model: string | null;
  readonly format: string | null;
  readonly deleted: boolean | null;
  readonly id: string | null;
  readonly location: string | null;
  readonly bytes: number | null;
  readonly sha1: string | null;
  readonly text: string | null;

  constructor(options: ContentOptions = {}) {
    this.role = noneOr(options.role, String);
    this.origin = noneOr(options.origin, Number);
    this.model = noneOr(options.model, String);
    this.format = noneOr(options.format, String);
    this.deleted = noneOr(options.deleted, Boolean);
    this.id = noneOr(options.id, String);
    this.location = noneOr(options.location, String);
    this.bytes = noneOr(options.bytes, Number);
    this.sha1 = noneOr(options.sha1, String);
    this.text = noneOr(options.text, String);
  }

  toJSON(): Json {
    const doc: { [key: string]: Json } = {};
    if (this.role !== null) doc.role = this.role;
    if (this.origin !== null) doc.origin = this.origin;
    if (this.model !== null) doc.model = this.model;
    if (this.format !== null) doc.format = this.format;
    if (this.deleted !== null) doc.deleted = this.deleted;
    if (this.id !== null) doc.id = this.id;
    if (this.location !== null) doc.location = this.location;
    if (this.bytes !== null) doc.bytes = this.bytes;
    if (this.sha1 !== null) doc.sha1 = this.sha1;
    if (this.text !== null) doc.text = this.text;
    return doc;
  }

  static async fromElement(element: ElementIterator): Promise<Content> {
    let role: string | null = null;
    let origin: string | null = null;
    let model: string | null = null;
    let format: string | null = null;
    let deleted: boolean | null = null;
    let id: string | null = null;
    let location: string | null = null;
    let bytes: string | null = null;
    let sha1: string | null = null;
    let text: string | null = null;

    for await (const subElement of element) {
      const tag = subElement.tag;
      if (tag === "role") {
        role = await subElement.text();
      } else if (tag === "origin") {
        origin = await subElement.text();
      } else if (tag === "model") {
        model = await subElement.text();
      } else if (tag === "format") {
        format = await subElement.text();
      } else if (tag === "id") {
        id = await subElement.text();
      } else if (tag === "text") {
        deleted = subElement.attr("deleted") !== null;
        location = subElement.attr("location");
        bytes = subElement.attr("bytes");
        sha1 = subElement.attr("sha1");
        text = (await subElement.text()) || null;
      } else {
        // Python reports this error against <revision>; kept verbatim.
        throw new MalformedXML(
          `Unexpected tag found when processing a <revision>: '${tag}'`,
        );
      }
    }

    return new Content({
      role,
      origin,
      model,
      format,
      deleted,
      location,
      id,
      bytes,
      sha1,
      text,
    });
  }
}

/**
 * The content slots of a revision, keyed by role name.
 */
export class Slots {
  readonly sha1: string | null;
  readonly contents: { [role: string]: Content };

  constructor(
    sha1: string | null,
    contents: { [role: string]: Content } = {},
  ) {
    this.sha1 = noneOr(sha1, String);
    this.contents = { ...contents };
  }

  get(role: string): Content | undefined {
    return this.contents[role];
  }

  has(role: string): boolean {
    return role in this.contents;
  }

  toJSON(): Json {
    const doc: { [key: string]: Json } = {};
    if (this.sha1 !== null) doc.sha1 = this.sha1;
    const contents: { [role: string]: Json } = {};
    for (const [role, content] of Object.entries(this.contents)) {
      contents[role] = content.toJSON();
    }
    doc.contents = contents;
    return doc;
  }
}
