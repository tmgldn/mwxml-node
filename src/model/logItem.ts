import { MalformedXML } from "../errors.js";
import { ElementIterator } from "../elementIterator.js";
import { noneOr } from "../util.js";
import type { Json } from "../json.js";
import { extractNamespace } from "./page.js";
import type { Namespace } from "./namespace.js";
import { Timestamp } from "./timestamp.js";
import { User } from "./user.js";

export interface LogItemDeletedOptions {
  action?: boolean | null;
  comment?: boolean | null;
  user?: boolean | null;
  restricted?: boolean | null;
}

/**
 * Represents information about the deleted/suppressed status of a log item
 * and its associated data.
 */
export class LogItemDeleted {
  readonly action: boolean | null;
  readonly comment: boolean | null;
  readonly user: boolean | null;
  readonly restricted: boolean | null;

  constructor(options: LogItemDeletedOptions = {}) {
    this.action = noneOr(options.action, Boolean);
    this.comment = noneOr(options.comment, Boolean);
    this.user = noneOr(options.user, Boolean);
    this.restricted = noneOr(options.restricted, Boolean);
  }

  /**
   * Constructs a `LogItemDeleted` using the `tinyint` value of the
   * `log_deleted` column of the `logging` MariaDB table:
   *
   * - DELETED_ACTION = 1
   * - DELETED_COMMENT = 2
   * - DELETED_USER = 4
   * - DELETED_RESTRICTED = 8
   */
  static fromInt(integer: number): LogItemDeleted {
    const binString = integer.toString(2);
    return new LogItemDeleted({
      action: binString.length >= 1 && binString[binString.length - 1] === "1",
      comment:
        binString.length >= 2 && binString[binString.length - 2] === "1",
      user: binString.length >= 3 && binString[binString.length - 3] === "1",
      restricted:
        binString.length >= 4 && binString[binString.length - 4] === "1",
    });
  }

  toJSON(): Json {
    const doc: { [key: string]: Json } = {};
    if (this.action !== null) doc.action = this.action;
    if (this.comment !== null) doc.comment = this.comment;
    if (this.user !== null) doc.user = this.user;
    if (this.restricted !== null) doc.restricted = this.restricted;
    return doc;
  }
}

export interface LogItemPageOptions {
  namespace?: number | null;
  title?: string | null;
}

/**
 * Log item page information.
 */
export class LogItemPage {
  readonly namespace: number | null;
  readonly title: string | null;

  constructor(options: LogItemPageOptions = {}) {
    this.namespace = noneOr(options.namespace, Number);
    this.title = noneOr(options.title, String);
  }

  toJSON(): Json {
    const doc: { [key: string]: Json } = {};
    if (this.namespace !== null) doc.namespace = this.namespace;
    if (this.title !== null) doc.title = this.title;
    return doc;
  }
}

export interface LogItemOptions {
  timestamp?: Timestamp | string | null;
  user?: User | null;
  page?: LogItemPage | null;
  comment?: string | null;
  type?: string | null;
  action?: string | null;
  text?: string | null;
  params?: string | null;
  deleted?: LogItemDeleted | null;
}

/**
 * Log item metadata.
 */
export class LogItem {
  readonly id: number;
  readonly timestamp: Timestamp | null;
  readonly user: User | null;
  readonly page: LogItemPage | null;
  readonly comment: string | null;
  readonly type: string | null;
  readonly action: string | null;
  readonly text: string | null;
  readonly params: string | null;
  readonly deleted: LogItemDeleted | null;

  constructor(id: number, options: LogItemOptions = {}) {
    if (id === null || id === undefined) {
      // Python's int(None) raises a TypeError; mirror that here.
      throw new TypeError("LogItem id must not be null");
    }
    this.id = Number(id);
    this.timestamp = noneOr(options.timestamp, (v) =>
      v instanceof Timestamp ? v : new Timestamp(v),
    );
    this.user = options.user ?? null;
    this.page = options.page ?? null;
    this.comment = noneOr(options.comment, String);
    this.type = noneOr(options.type, String);
    this.action = noneOr(options.action, String);
    this.text = noneOr(options.text, String);
    this.params = noneOr(options.params, String);
    this.deleted = options.deleted ?? null;
  }

  toJSON(): Json {
    const doc: { [key: string]: Json } = { id: this.id };
    if (this.timestamp !== null) doc.timestamp = this.timestamp.toJSON();
    if (this.user !== null) doc.user = this.user.toJSON();
    if (this.page !== null) doc.page = this.page.toJSON();
    if (this.comment !== null) doc.comment = this.comment;
    if (this.type !== null) doc.type = this.type;
    if (this.action !== null) doc.action = this.action;
    if (this.text !== null) doc.text = this.text;
    if (this.params !== null) doc.params = this.params;
    if (this.deleted !== null) doc.deleted = this.deleted.toJSON();
    return doc;
  }

  static async fromElement(
    element: ElementIterator,
    namespaceMap: { [name: string]: Namespace } | null = null,
  ): Promise<LogItem> {
    let id: number | null = null;
    let timestamp: Timestamp | null = null;
    let comment: string | null = null;
    let user: User | null = null;
    let page: LogItemPage | null = null;
    let type: string | null = null;
    let action: string | null = null;
    let text: string | null = null;
    let params: string | null = null;
    let commentDeleted: boolean | null = null;
    let userDeleted: boolean | null = null;

    for await (const subElement of element) {
      const tag = subElement.tag;
      if (tag === "id") {
        id = noneOr(await subElement.text(), Number);
      } else if (tag === "timestamp") {
        const value = await subElement.text();
        timestamp = noneOr(value, (v) => new Timestamp(v));
      } else if (tag === "comment") {
        commentDeleted = subElement.attr("deleted") !== null;
        if (!commentDeleted) {
          comment = await subElement.text();
        }
      } else if (tag === "contributor") {
        userDeleted = subElement.attr("deleted") !== null;
        if (!userDeleted) {
          user = await User.fromElement(subElement);
        }
      } else if (tag === "logtitle") {
        const logTitle = await subElement.text();
        let namespace: number | null = null;
        let title: string | null = null;
        if (logTitle === null) {
          // no title text
        } else if (namespaceMap !== null) {
          [namespace, title] = extractNamespace(logTitle, namespaceMap);
        } else {
          // Bug kept for compatibility with Python's mwxml: the title is
          // read from the <logitem> element itself instead of the
          // <logtitle> sub-element.  Reading it completes the log item,
          // which skips any remaining sub-elements (e.g. <type>,
          // <action> and <params>).
          title = await element.text();
        }
        page = new LogItemPage({ namespace, title });
      } else if (tag === "type") {
        type = await subElement.text();
      } else if (tag === "action") {
        action = await subElement.text();
      } else if (tag === "text") {
        console.warn("A <text> tag was seen in a log item ... ignoring");
      } else if (tag === "params") {
        params = await subElement.text();
      } else {
        throw new MalformedXML(
          `Unexpected tag found when processing a <logitem>: '${tag}'`,
        );
      }
    }

    const deleted = new LogItemDeleted({
      comment: commentDeleted,
      user: userDeleted,
    });

    return new LogItem(id as number, {
      timestamp,
      comment,
      user,
      page,
      type,
      action,
      text,
      params,
      deleted,
    });
  }
}
