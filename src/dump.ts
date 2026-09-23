import { MalformedXML } from "./errors.js";
import { ElementIterator, type XmlStream } from "./elementIterator.js";
import { LogItem } from "./model/logItem.js";
import type { Namespace } from "./model/namespace.js";
import { Page } from "./model/page.js";
import { SiteInfo } from "./model/siteInfo.js";
import { reader, concat, type InputStream } from "./files.js";

/**
 * XML dump iterator: dump file metadata and an async iterator of pages
 * and/or log items.  Usually constructed through `Dump.fromFile()`.
 *
 * ```ts
 * import { Dump } from "node-mwxml";
 *
 * const dump = await Dump.fromFile("example/dump.xml");
 *
 * for await (const page of dump) {
 *   for await (const revision of page) {
 *     console.log(revision.id);
 *   }
 * }
 * ```
 *
 * `dump.items`, `dump.pages` and `dump.logItems` (and iterating `dump`
 * directly) all share a single underlying iterator — consuming any of them
 * consumes the others.  This bug-compatible behavior is inherited from the
 * Python library.
 */
export class Dump {
  readonly siteInfo: SiteInfo;
  private readonly itemsGenerator: AsyncGenerator<Page | LogItem, void, void>;

  constructor(
    siteInfo: SiteInfo,
    items: AsyncIterable<Page | LogItem> | null = null,
  ) {
    this.siteInfo = siteInfo instanceof SiteInfo ? siteInfo : new SiteInfo(siteInfo);
    if (items === null) {
      this.itemsGenerator = (async function *() {
        // yields nothing
      })();
    } else {
      const source = items;
      this.itemsGenerator = (async function *() {
        yield * source;
      })();
    }
  }

  /**
   * The pages and/or log items that appear in the dump.
   */
  get items(): AsyncIterable<Page | LogItem> {
    const itemsGenerator = this.itemsGenerator;
    return {
      async *[Symbol.asyncIterator]() {
        for (;;) {
          // Pull explicitly so that breaking out of the iteration leaves
          // the shared generator suspended and resumable.
          const result = await itemsGenerator.next();
          if (result.done) return;
          yield result.value;
        }
      },
    };
  }

  /**
   * The pages that appear in the dump.  Shares its iterator with `items`
   * and `logItems`.
   */
  get pages(): AsyncIterable<Page> {
    return this.filtered((item) => item instanceof Page) as AsyncIterable<Page>;
  }

  /**
   * The log items that appear in the dump.  Shares its iterator with
   * `items` and `pages`.
   */
  get logItems(): AsyncIterable<LogItem> {
    return this.filtered(
      (item) => item instanceof LogItem,
    ) as AsyncIterable<LogItem>;
  }

  private filtered(
    predicate: (item: Page | LogItem) => boolean,
  ): AsyncIterable<Page | LogItem> {
    const itemsGenerator = this.itemsGenerator;
    return {
      async *[Symbol.asyncIterator]() {
        for (;;) {
          const result = await itemsGenerator.next();
          if (result.done) return;
          if (predicate(result.value)) yield result.value;
        }
      },
    };
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<Page | LogItem, void, void> {
    yield * this.items;
  }

  static async *loadItems(
    firstItemElement: ElementIterator | null,
    element: ElementIterator,
    namespaceMap: { [name: string]: Namespace } | null,
  ): AsyncGenerator<Page | LogItem, void, void> {
    if (firstItemElement !== null) {
      yield await Dump.processItem(firstItemElement, namespaceMap);
      // Ensure that we complete the current tag block
      await firstItemElement.clear();
    }

    for await (const itemElement of element) {
      yield await Dump.processItem(itemElement, namespaceMap);
    }
  }

  static async processItem(
    itemElement: ElementIterator,
    namespaceMap: { [name: string]: Namespace } | null,
  ): Promise<Page | LogItem> {
    if (itemElement.tag === "page") {
      return await Page.fromElement(itemElement, namespaceMap);
    } else if (itemElement.tag === "logitem") {
      return await LogItem.fromElement(itemElement, namespaceMap);
    } else {
      throw new MalformedXML(
        `Expected to see <page> or <logitem>.  Instead saw <${itemElement.tag}>`,
      );
    }
  }

  static async fromElement(element: ElementIterator): Promise<Dump> {
    let siteInfo: SiteInfo | null = null;
    let firstItemElement: ElementIterator | null = null;

    // Consume <siteinfo>
    for await (const subElement of element) {
      if (subElement.tag === "siteinfo") {
        siteInfo = await SiteInfo.fromElement(subElement);
      } else if (subElement.tag === "page" || subElement.tag === "logitem") {
        firstItemElement = subElement;
        break;
      } else {
        throw new MalformedXML(
          `Unexpected tag found when processing a <mediawiki>: '${subElement.tag}'`,
        );
      }
      // Assuming that the first <page> seen marks the end of dump
      // metadata.  This assumption is not a safe one in general, but it is
      // the one the Python library makes.
    }

    if (siteInfo === null) {
      throw new MalformedXML(
        "<siteinfo> tag not found when processing a <mediawiki>",
      );
    }

    let namespaceMap: { [name: string]: Namespace } | null = null;
    if (siteInfo.namespaces !== null) {
      namespaceMap = {};
      for (const namespace of siteInfo.namespaces) {
        namespaceMap[namespace.name] = namespace;
      }
    }

    // Consume all <page> and <logitem>
    const items = Dump.loadItems(firstItemElement, element, namespaceMap);

    return new Dump(siteInfo, items);
  }

  /**
   * Constructs a `Dump` from a stream (or a path to a plain, gzipped or
   * bz2-compressed dump file).
   */
  static async fromFile(f: XmlStream | string): Promise<Dump> {
    const stream = typeof f === "string" ? reader(f) : f;
    const element = await ElementIterator.fromFile(stream);
    if (element.tag !== "mediawiki") {
      throw new Error(
        `Assertion failed: expected <mediawiki>, saw <${element.tag}>`,
      );
    }
    return await Dump.fromElement(element);
  }

  /**
   * Constructs a `Dump` from a `<page>` block (a string or a stream).
   */
  static async fromPageXml(pageXml: string | InputStream): Promise<Dump> {
    const header = `
        <mediawiki xmlns="http://www.mediawiki.org/xml/export-0.5/"
                   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   xsi:schemaLocation="http://www.mediawiki.org/xml/export-0.5/
                     http://www.mediawiki.org/xml/export-0.5.xsd" version="0.5"
                   xml:lang="en">
        <siteinfo>
        </siteinfo>
        `;

    const footer = "</mediawiki>";

    return await Dump.fromFile(concat(header, pageXml, footer));
  }
}
