import { MalformedXML } from "../errors.js";
import { ElementIterator } from "../elementIterator.js";
import { noneOr } from "../util.js";
import type { Json } from "../json.js";
import { Content, Slots } from "./content.js";
import type { Page } from "./page.js";
import { Timestamp } from "./timestamp.js";
import { User } from "./user.js";

export interface RevisionDeletedOptions {
  text?: boolean | null;
  comment?: boolean | null;
  user?: boolean | null;
  restricted?: boolean | null;
}

/**
 * Represents information about the deleted/suppressed status of a revision
 * and its associated data.
 */
export class RevisionDeleted {
  readonly text: boolean | null;
  readonly comment: boolean | null;
  readonly user: boolean | null;
  readonly restricted: boolean | null;

  constructor(options: RevisionDeletedOptions = {}) {
    this.text = noneOr(options.text, Boolean);
    this.comment = noneOr(options.comment, Boolean);
    this.user = noneOr(options.user, Boolean);
    this.restricted = noneOr(options.restricted, Boolean);
  }

  /**
   * Constructs a `RevisionDeleted` using the `tinyint` value of the
   * `rev_deleted` column of the `revision` MariaDB table:
   *
   * - DELETED_TEXT = 1
   * - DELETED_COMMENT = 2
   * - DELETED_USER = 4
   * - DELETED_RESTRICTED = 8
   */
  static fromInt(integer: number): RevisionDeleted {
    const binString = integer.toString(2);
    return new RevisionDeleted({
      text: binString.length >= 1 && binString[binString.length - 1] === "1",
      comment:
        binString.length >= 2 && binString[binString.length - 2] === "1",
      user: binString.length >= 3 && binString[binString.length - 3] === "1",
      restricted:
        binString.length >= 4 && binString[binString.length - 4] === "1",
    });
  }

  toJSON(): Json {
    const doc: { [key: string]: Json } = {};
    if (this.text !== null) doc.text = this.text;
    if (this.comment !== null) doc.comment = this.comment;
    if (this.user !== null) doc.user = this.user;
    if (this.restricted !== null) doc.restricted = this.restricted;
    return doc;
  }
}

export interface RevisionOptions {
  timestamp?: Timestamp | string | null;
  user?: User | null;
  page?: Page | null;
  minor?: boolean | null;
  comment?: string | null;
  slots?: Slots | null;
  parentId?: number | string | null;
  deleted?: RevisionDeleted | null;
}

/**
 * Revision metadata and text.
 *
 * The `text`, `sha1`, `model`, `format` and `bytes` getters are conveniences
 * derived from the `main` slot (mirroring Python's `mwtypes.Revision`).
 */
export class Revision {
  readonly id: number | null;
  readonly timestamp: Timestamp | null;
  readonly user: User | null;
  page: Page | null;
  readonly minor: boolean | null;
  readonly comment: string | null;
  readonly parentId: number | null;
  readonly deleted: RevisionDeleted | null;
  readonly slots: Slots | null;

  constructor(id: number | null, options: RevisionOptions = {}) {
    this.id = noneOr(id, Number);
    this.timestamp = noneOr(options.timestamp, (v) =>
      v instanceof Timestamp ? v : new Timestamp(v),
    );
    this.user = options.user ?? null;
    this.page = options.page ?? null;
    this.minor = noneOr(options.minor, Boolean);
    this.comment = noneOr(options.comment, String);
    this.parentId = noneOr(options.parentId, Number);
    this.deleted = options.deleted ?? null;
    this.slots = options.slots ?? null;
  }

  /**
   * The content of the revision's `main` slot (or `null`).
   */
  get mainContent(): Content | null {
    return this.slots?.get("main") ?? null;
  }

  get text(): string | null {
    return this.mainContent?.text ?? null;
  }

  get sha1(): string | null {
    return this.mainContent?.sha1 ?? null;
  }

  get model(): string | null {
    return this.mainContent?.model ?? null;
  }

  get format(): string | null {
    return this.mainContent?.format ?? null;
  }

  get bytes(): number | null {
    return this.mainContent?.bytes ?? null;
  }

  toJSON(): Json {
    const doc: { [key: string]: Json } = {};
    if (this.id !== null) doc.id = this.id;
    if (this.timestamp !== null) doc.timestamp = this.timestamp.toJSON();
    if (this.user !== null) doc.user = this.user.toJSON();
    if (this.page !== null) doc.page = this.page.toJSON();
    if (this.minor !== null) doc.minor = this.minor;
    if (this.comment !== null) doc.comment = this.comment;
    if (this.slots !== null) doc.slots = this.slots.toJSON();
    if (this.parentId !== null) doc.parentId = this.parentId;
    if (this.deleted !== null) doc.deleted = this.deleted.toJSON();
    return doc;
  }

  static async fromElement(element: ElementIterator): Promise<Revision> {
    let id: number | null = null;
    let timestamp: Timestamp | null = null;
    let user: User | null = null;
    let userDeleted = false;
    let minor = false;
    let origin: string | null = null;
    let comment: string | null = null;
    let commentDeleted = false;
    let text: string | null = null;
    let textDeleted = false;
    let textSha1: string | null = null;
    let textBytes: string | null = null;
    let textId: string | null = null;
    let textLocation: string | null = null;
    let sha1: string | null = null;
    let parentId: string | null = null;
    let model: string | null = null;
    let format: string | null = null;
    const contents: Content[] = [];

    for await (const subElement of element) {
      const tag = subElement.tag;
      if (tag === "id") {
        id = noneOr(await subElement.text(), Number);
      } else if (tag === "timestamp") {
        const value = await subElement.text();
        timestamp = noneOr(value, (v) => new Timestamp(v));
      } else if (tag === "contributor") {
        userDeleted = subElement.attr("deleted") !== null;
        if (!userDeleted) {
          user = await User.fromElement(subElement);
        }
      } else if (tag === "minor") {
        minor = true;
      } else if (tag === "origin") {
        // Parsed for parity with Python's mwxml, where the value is read but
        // never used.
        origin = await subElement.text();
      } else if (tag === "sha1") {
        sha1 = await subElement.text();
      } else if (tag === "parentid") {
        parentId = await subElement.text();
      } else if (tag === "model") {
        model = await subElement.text();
      } else if (tag === "format") {
        format = await subElement.text();
      } else if (tag === "comment") {
        commentDeleted = subElement.attr("deleted") !== null;
        if (!commentDeleted) {
          comment = await subElement.text();
        }
      } else if (tag === "text") {
        textDeleted = subElement.attr("deleted") !== null;
        text = (await subElement.text()) || null;
        textSha1 = subElement.attr("sha1");
        textBytes = subElement.attr("bytes");
        textId = subElement.attr("id");
        textLocation = subElement.attr("location");
      } else if (tag === "content") {
        contents.push(await Content.fromElement(subElement));
      } else {
        throw new MalformedXML(
          `Unexpected tag found when processing a <revision>: '${tag}'`,
        );
      }
    }

    void origin;

    const deleted = new RevisionDeleted({
      comment: commentDeleted,
      text: textDeleted,
      user: userDeleted,
    });

    if (textSha1 !== null) {
      // We are working with the new format
      contents.unshift(
        new Content({
          role: "main",
          model,
          deleted: textDeleted,
          format,
          bytes: textBytes,
          sha1: textSha1,
          id: textId,
          location: textLocation,
          text,
        }),
      );
    } else if (contents.length === 0) {
      // We are working with the old format
      contents.unshift(
        new Content({
          role: "main",
          model,
          deleted: textDeleted,
          format,
          bytes: textBytes,
          sha1,
          text,
        }),
      );
    } else {
      console.warn(
        "Found a <content> tag but no sha1 attribute on the <text> tag.  " +
          "Should be impossible.",
      );
    }

    const slots = new Slots(
      sha1,
      Object.fromEntries(contents.map((content) => [content.role, content])),
    );

    return new Revision(id, {
      timestamp,
      user,
      minor,
      parentId,
      comment,
      deleted,
      slots,
    });
  }
}
