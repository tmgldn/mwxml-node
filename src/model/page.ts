import { MalformedXML } from "../errors.js";
import { ElementIterator } from "../elementIterator.js";
import { noneOr } from "../util.js";
import type { Json } from "../json.js";
import type { Namespace } from "./namespace.js";
import { Revision } from "./revision.js";

export interface PageOptions {
  redirect?: string | null;
  restrictions?: (string | null)[] | null;
  revisions?: AsyncIterable<Revision> | null;
}

/**
 * Page metadata and a lazy, streaming iterator of revisions.  Instances can
 * be iterated directly:
 *
 * ```ts
 * for await (const revision of page) {
 *   console.log(revision.id, page.id);
 * }
 * ```
 *
 * Iterating a page assigns the page to `revision.page` (mirroring Python).
 */
export class Page {
  readonly id: number | null;
  readonly title: string | null;
  readonly namespace: number | null;
  readonly redirect: string | null;
  readonly restrictions: (string | null)[] | null;
  private readonly revisions: AsyncIterable<Revision> | null;

  constructor(
    id: number | null = null,
    title: string | null = null,
    namespace: number | null = null,
    options: PageOptions = {},
  ) {
    this.id = noneOr(id, Number);
    this.title = noneOr(title, String);
    this.namespace = noneOr(namespace, Number);
    this.redirect = noneOr(options.redirect, String);
    this.restrictions = noneOr(options.restrictions, (v) => [...v]);
    this.revisions = options.revisions ?? null;
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<Revision, void, void> {
    if (this.revisions === null) return;
    const revisions = this.revisions[Symbol.asyncIterator]();
    for (;;) {
      // Pull explicitly so that breaking out of the iteration leaves the
      // revisions generator suspended and resumable.
      const result = await revisions.next();
      if (result.done) return;
      result.value.page = this;
      yield result.value;
    }
  }

  toJSON(): Json {
    const doc: { [key: string]: Json } = {};
    if (this.id !== null) doc.id = this.id;
    if (this.title !== null) doc.title = this.title;
    if (this.namespace !== null) doc.namespace = this.namespace;
    if (this.redirect !== null) doc.redirect = this.redirect;
    if (this.restrictions !== null) doc.restrictions = [...this.restrictions];
    return doc;
  }

  static async *loadRevisions(
    firstRevision: ElementIterator | null,
    element: ElementIterator,
  ): AsyncGenerator<Revision, void, void> {
    if (firstRevision !== null) {
      yield await Revision.fromElement(firstRevision);
    }

    for await (const subElement of element) {
      if (subElement.tag === "revision") {
        yield await Revision.fromElement(subElement);
      } else {
        throw new MalformedXML(
          `Expected to see <revision>.  Instead saw <${subElement.tag}>`,
        );
      }
    }
  }

  static async fromElement(
    element: ElementIterator,
    namespaceMap: { [name: string]: Namespace } | null = null,
  ): Promise<Page> {
    let title: string | null = null;
    let pageName: string | null = null;
    let namespace: number | null = null;
    let id: number | null = null;
    let redirect: string | null = null;
    const restrictions: (string | null)[] = [];

    let firstRevision: ElementIterator | null = null;

    // Consume each of the elements until we see <revision> which should
    // signal the start of revision data.  Assuming that the first revision
    // seen marks the end of page metadata is not a safe assumption in
    // general, but it is the one the Python library makes.
    for await (const subElement of element) {
      const tag = subElement.tag;
      if (tag === "title") {
        pageName = await subElement.text();
      } else if (tag === "ns") {
        namespace = noneOr(await subElement.text(), Number);
      } else if (tag === "id") {
        id = noneOr(await subElement.text(), Number);
      } else if (tag === "redirect") {
        redirect = subElement.attr("title");
      } else if (tag === "restrictions") {
        restrictions.push(await subElement.text());
      } else if (tag === "revision") {
        firstRevision = subElement;
        break;
      } else if (tag === "DiscussionThreading") {
        console.warn("Encountered <DiscussionThreading> and skipping it ...");
      } else {
        throw new MalformedXML(
          `Unexpected tag found when processing a <page>: '${tag}'`,
        );
      }
    }

    // Assuming that we got here by seeing a <revision> tag.  See the
    // verbose comment above.
    const revisions = Page.loadRevisions(firstRevision, element);

    // Normalize title and extract namespace
    if (namespace !== null) {
      // Always trust the <ns> tag as authoritative
      title = pageName === null ? null : normalizeTitle(pageName);
    } else {
      const [extractedNamespace, extractedTitle] = extractNamespace(
        pageName ?? "",
        namespaceMap,
      );
      namespace = extractedNamespace;
      title = extractedTitle;
    }

    // Construct class
    return new Page(id, title, namespace, {
      redirect,
      restrictions,
      revisions,
    });
  }
}

/**
 * Replaces underscores with spaces in a page title.
 */
export function normalizeTitle(title: string): string {
  return title.replaceAll("_", " ");
}

/**
 * Extracts a namespace id and a normalized title from a raw page name using
 * the dump's namespace map.  Returns namespace `0` when the name does not
 * reference a known namespace.
 */
export function extractNamespace(
  pageName: string,
  namespaceMap: { [name: string]: Namespace } | null,
): [number, string] {
  const colonIndex = pageName.indexOf(":");
  const hasColon = colonIndex !== -1;
  const rest = hasColon ? pageName.slice(colonIndex + 1) : null;
  if (!hasColon || namespaceMap === null || rest === null ||
      rest.startsWith(" ")) {
    return [0, normalizeTitle(pageName)];
  } else {
    const nsName = pageName.slice(0, colonIndex);
    if (nsName in namespaceMap) {
      return [namespaceMap[nsName].id, normalizeTitle(rest)];
    } else {
      return [0, normalizeTitle(pageName)];
    }
  }
}
