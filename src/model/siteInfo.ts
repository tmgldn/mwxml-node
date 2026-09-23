import { ElementIterator } from "../elementIterator.js";
import { noneOr } from "../util.js";
import type { Json } from "../json.js";
import { Namespace } from "./namespace.js";

export interface SiteInfoOptions {
  name?: string | null;
  dbname?: string | null;
  base?: string | null;
  generator?: string | null;
  case?: string | null;
  namespaces?: Namespace[] | null;
}

/**
 * Represents the data from the `<siteinfo>` block in a MediaWiki XML dump.
 */
export class SiteInfo {
  readonly name: string | null;
  readonly dbname: string | null;
  readonly base: string | null;
  readonly generator: string | null;
  readonly case: string | null;
  readonly namespaces: Namespace[] | null;

  constructor(options: SiteInfo | SiteInfoOptions) {
    if (options instanceof SiteInfo) {
      this.name = options.name;
      this.dbname = options.dbname;
      this.base = options.base;
      this.generator = options.generator;
      this.case = options.case;
      this.namespaces = options.namespaces;
      return;
    }
    this.name = noneOr(options.name, String);
    this.dbname = noneOr(options.dbname, String);
    this.base = noneOr(options.base, String);
    this.generator = noneOr(options.generator, String);
    this.case = noneOr(options.case, String);
    this.namespaces = noneOr(options.namespaces, (v) => [...v]);
  }

  toJSON(): Json {
    const doc: { [key: string]: Json } = {};
    if (this.name !== null) doc.name = this.name;
    if (this.dbname !== null) doc.dbname = this.dbname;
    if (this.base !== null) doc.base = this.base;
    if (this.generator !== null) doc.generator = this.generator;
    if (this.case !== null) doc.case = this.case;
    if (this.namespaces !== null) {
      doc.namespaces = this.namespaces.map((ns) => ns.toJSON());
    }
    return doc;
  }

  static async loadNamespaces(
    element: ElementIterator,
  ): Promise<Namespace[]> {
    const namespaces: Namespace[] = [];
    for await (const subElement of element) {
      if (subElement.tag === "namespace") {
        namespaces.push(await Namespace.fromElement(subElement));
      } else {
        // Mirrors Python's `assert False, "This should never happen"`.
        throw new Error("This should never happen");
      }
    }
    return namespaces;
  }

  static async fromElement(element: ElementIterator): Promise<SiteInfo> {
    if (element.tag !== "siteinfo") {
      throw new Error(
        `Assertion failed: expected <siteinfo>, saw <${element.tag}>`,
      );
    }
    let name: string | null = null;
    let dbname: string | null = null;
    let base: string | null = null;
    let generator: string | null = null;
    let case_: string | null = null;
    let namespaces: Namespace[] | null = null;

    for await (const subElement of element) {
      if (subElement.tag === "sitename") {
        name = await subElement.text();
      } else if (subElement.tag === "dbname") {
        dbname = await subElement.text();
      } else if (subElement.tag === "base") {
        base = await subElement.text();
      } else if (subElement.tag === "generator") {
        generator = await subElement.text();
      } else if (subElement.tag === "case") {
        case_ = await subElement.text();
      } else if (subElement.tag === "namespaces") {
        namespaces = await SiteInfo.loadNamespaces(subElement);
      }
    }

    return new SiteInfo({
      name,
      dbname,
      base,
      generator,
      case: case_,
      namespaces,
    });
  }
}
