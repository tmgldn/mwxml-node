import { Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import { SaxesParser } from "saxes";

import { MalformedXML } from "./errors.js";

/**
 * Any source of XML data: a Node stream, an async iterable of chunks, or a
 * plain string.
 */
export type XmlStream =
  | AsyncIterable<Buffer | string>
  | NodeJS.ReadableStream;

/**
 * An open XML element being streamed: its (namespace-stripped) tag name, its
 * attributes and the text accumulated before its first child (mirroring
 * `ElementTree`'s `element.text` semantics).
 */
export interface XElement {
  tag: string;
  attrs: Record<string, string>;
  /**
   * Text chunks accumulated before the first child element, or `null` once
   * the element has been cleared.
   */
  text: string[] | null;
  /**
   * Whether a child element has been seen.  Text encountered after a child
   * starts belongs to the child's tail and is ignored.
   */
  childSeen: boolean;
}

export interface PointerEvent {
  event: "start" | "end";
  element: XElement;
}

/**
 * Strips a namespace URI (`{uri}tag`, as produced by Python's ElementTree)
 * and a namespace prefix (`prefix:tag`) from a tag name.
 */
export function trimNs(tag: string): string {
  const brace = tag.indexOf("}");
  const noUri = brace === -1 ? tag : tag.slice(brace + 1);
  const colon = noUri.indexOf(":");
  return colon === -1 ? noUri : noUri.slice(colon + 1);
}

/**
 * Feeds chunks from a stream into saxes on demand and exposes the resulting
 * start/end tag events through a pull-based async queue.
 */
class SaxEventSource {
  private parser: SaxesParser;
  private iterator: AsyncIterator<Buffer | string>;
  private decoder = new StringDecoder("utf8");
  private events: PointerEvent[] = [];
  private stack: XElement[] = [];
  private ended = false;
  private failed = false;
  private error: Error | null = null;
  /**
   * The first 500 characters of the document, kept around to enrich parse
   * errors with context (like Python's `ElementIterator.from_file`).
   */
  documentHead = "";

  constructor(stream: XmlStream) {
    this.iterator = (stream as AsyncIterable<Buffer | string>)[
      Symbol.asyncIterator
    ]();

    this.parser = new SaxesParser({ fragment: false });
    this.parser.on("opentag", (tag) => {
      const parent = this.stack[this.stack.length - 1];
      if (parent !== undefined) parent.childSeen = true;

      const element: XElement = {
        tag: trimNs(tag.name),
        attrs: { ...tag.attributes } as Record<string, string>,
        text: [],
        childSeen: false,
      };
      this.stack.push(element);
      this.push({ event: "start", element });
    });
    this.parser.on("closetag", () => {
      const element = this.stack.pop() as XElement;
      this.push({ event: "end", element });
    });
    this.parser.on("text", (text) => {
      const top = this.stack[this.stack.length - 1];
      if (top !== undefined && !top.childSeen && top.text !== null) {
        top.text.push(text);
      }
    });
    this.parser.on("error", (error) => {
      if (!this.failed) {
        this.failed = true;
        this.error = error;
        this.ended = true;
      }
    });
    this.parser.on("end", () => {
      this.ended = true;
    });
  }

  private push(event: PointerEvent): void {
    this.events.push(event);
  }

  /**
   * Returns the next start/end event, or `null` once the document is
   * exhausted (the async equivalent of `StopIteration`).  Parse errors are
   * thrown.
   */
  async next(): Promise<PointerEvent | null> {
    for (;;) {
      if (this.events.length > 0) return this.events.shift() as PointerEvent;
      if (this.error !== null) throw this.error;
      if (this.ended) return null;
      await this.fill();
    }
  }

  private async fill(): Promise<void> {
    if (this.failed) return;
    const result = await this.iterator.next();
    if (result.done) {
      this.parser.close();
      return;
    }
    const chunk = typeof result.value === "string"
      ? result.value
      : this.decoder.write(result.value);
    if (this.documentHead.length < 500) {
      this.documentHead = (this.documentHead + chunk).slice(0, 500);
    }
    this.parser.write(chunk);
  }
}

/**
 * Wraps a stream of XML SAX events, maintaining a stack of open tags so that
 * the current nesting depth can be tracked while streaming.
 */
export class EventPointer {
  readonly tagStack: string[] = [];
  private source: SaxEventSource;

  private constructor(source: SaxEventSource) {
    this.source = source;
  }

  /**
   * The number of currently open tags.
   */
  get depth(): number {
    return this.tagStack.length;
  }

  /**
   * The first 500 characters of the document (used for error context).
   */
  get documentHead(): string {
    return this.source.documentHead;
  }

  /**
   * Consumes the next SAX event, maintaining the tag stack.  Returns `null`
   * once the stream is exhausted.  Throws `MalformedXML` when an end tag does
   * not match the innermost open tag.
   */
  async next(): Promise<PointerEvent | null> {
    const event = await this.source.next();
    if (event === null) return null;

    if (event.event === "start") {
      this.tagStack.push(event.element.tag);
    } else {
      const top = this.tagStack[this.tagStack.length - 1];
      if (top === event.element.tag) {
        this.tagStack.pop();
      } else {
        throw new MalformedXML(
          `Expected ${top}, but saw ${event.element.tag}.`,
        );
      }
    }
    return event;
  }

  static fromFile(f: XmlStream): EventPointer {
    return new EventPointer(new SaxEventSource(f));
  }

  static fromString(string: string): EventPointer {
    return EventPointer.fromFile(Readable.from([string]));
  }
}

/**
 * An iterable XML element in a stream of XML.  Iterating an `ElementIterator`
 * yields the `ElementIterator`s of child elements as they are encountered in
 * the stream.
 */
export class ElementIterator {
  readonly tag: string;
  private element: XElement;
  private pointer: EventPointer;
  /**
   * The depth (number of open tags) outside of this element.
   */
  private myDepth: number;
  private done = false;

  constructor(element: XElement, pointer: EventPointer) {
    this.element = element;
    this.tag = element.tag;
    this.pointer = pointer;
    this.myDepth = pointer.depth - 1;
  }

  /**
   * Returns the value of an attribute of this element, or `alt` if the
   * attribute is missing.
   */
  attr(key: string, alt: string | null = null): string | null {
    const value = this.element.attrs[key];
    return value === undefined ? alt : value;
  }

  /**
   * The text of this element (the text between this element's start tag and
   * its first child).  Reading the text first completes (drains) the element.
   * Returns `null` if the element has no text or has been cleared.
   */
  async text(): Promise<string | null> {
    await this.complete();
    if (this.element.text === null) return null;
    const joined = this.element.text.join("");
    return joined.length === 0 ? null : joined;
  }

  /**
   * Drains the stream until this element is complete (its end tag has been
   * consumed).  If the stream is exhausted first, this is treated as a
   * normal completion.
   */
  async complete(): Promise<void> {
    while (!this.done && this.pointer.depth > this.myDepth) {
      const event = await this.pointer.next();
      if (event === null) {
        // Stream exhausted - this is normal completion
        break;
      }
    }
    this.done = true;
  }

  /**
   * Completes the element and frees its text and attributes (the streaming
   * equivalent of `ElementTree`'s `element.clear()`).
   */
  async clear(): Promise<void> {
    await this.complete();
    this.element.text = null;
    this.element.attrs = {};
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<
    ElementIterator,
    void,
    void
  > {
    while (!this.done && this.pointer.depth > this.myDepth) {
      const event = await this.pointer.next();
      if (event === null) {
        // Stream exhausted - this is normal completion
        break;
      }

      if (event.event === "start") {
        const subIterator = new ElementIterator(event.element, this.pointer);
        yield subIterator;
        await subIterator.clear();
      }
    }
    this.done = true;
  }

  /**
   * Constructs an `ElementIterator` over the root element of an XML stream.
   * Parse errors are enriched with the first 500 characters of the document.
   */
  static async fromFile(f: XmlStream): Promise<ElementIterator> {
    const pointer = EventPointer.fromFile(f);
    try {
      const event = await pointer.next();
      if (event === null) {
        throw new MalformedXML("No XML elements found in stream.");
      }
      if (event.event !== "start") {
        throw new MalformedXML(
          `Expected a start event, but saw ${event.event}.`,
        );
      }
      return new ElementIterator(event.element, pointer);
    } catch (error) {
      if (error instanceof MalformedXML) throw error;
      // Node filesystem errors (ENOENT, EISDIR, ...) pass through untouched;
      // XML parse errors are enriched with document context like Python's
      // ParseError re-raising.
      if (typeof (error as { code?: unknown }).code === "string") {
        throw error;
      }
      throw new Error(
        `${String(error)}: ${pointer.documentHead}...`,
      );
    }
  }

  static async fromString(string: string): Promise<ElementIterator> {
    return ElementIterator.fromFile(Readable.from([string]));
  }
}
