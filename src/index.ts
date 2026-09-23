/**
 * This library contains a collection of utilities for efficiently processing
 * MediaWiki's XML database dumps.  There are two important concerns that
 * this module intends to address: *performance* and the *complexity* of
 * streaming XML parsing.
 *
 * - *Complexity*: Streaming XML parsing is messy.  XML dumps are (1) some
 *   site metadata, (2) a collection of pages that contain (3) collections of
 *   revisions.  This module allows you to think about dump files in this way
 *   and ignore the fact that you're streaming XML.  A `Dump` contains a
 *   `SiteInfo` and an async iterator of `Page`s and/or `LogItem`s.  A
 *   `Page` contains page metadata and an async iterator of `Revision`s.  A
 *   `Revision` contains revision metadata and text.
 * - *Performance*: Processing large database XML dumps is a serious concern.
 *   `map()` distributes a dump processing function over a set of dump
 *   files with concurrency.
 */

export { MalformedXML } from "./errors.js";
export { Dump } from "./dump.js";
export { map } from "./map.js";
export type { DumpProcessor } from "./map.js";
export { Page, normalizeTitle, extractNamespace } from "./model/page.js";
export { LogItem, LogItemDeleted, LogItemPage } from "./model/logItem.js";
export { Revision, RevisionDeleted } from "./model/revision.js";
export { Content, Slots } from "./model/content.js";
export { SiteInfo } from "./model/siteInfo.js";
export { Namespace } from "./model/namespace.js";
export { User } from "./model/user.js";
export { Timestamp } from "./model/timestamp.js";
export type { Json } from "./json.js";
export {
  ElementIterator,
  EventPointer,
  trimNs,
  type XmlStream,
} from "./elementIterator.js";
export {
  concat,
  normalizePath,
  reader,
  writer,
  type InputStream,
} from "./files.js";
export { nextItem } from "./util.js";

export const version = "0.1.0";
export const description =
  "A set of utilities for processing MediaWiki XML dump data.";
export const license = "MIT";
export const url = "https://github.com/mediawiki-utilities/python-mwxml";
