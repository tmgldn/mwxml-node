import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";

import { ElementIterator, EventPointer } from "../src/elementIterator.js";

const TEST_XML = `
<foo>
    <bar>
        <herp>content</herp>
    </bar>
    <derp foo="bar"></derp>
</foo>
`;

function stream(xml: string): Readable {
  return Readable.from([xml]);
}

describe("element_iterator", () => {
  it("test_pointer", async () => {
    const pointer = EventPointer.fromFile(stream(TEST_XML));

    expect(pointer.tagStack).toEqual([]);
    expect(pointer.depth).toBe(0);

    let event = await pointer.next();
    expect(pointer.tagStack).toEqual(["foo"]);
    expect(pointer.depth).toBe(1);
    expect(event?.element.tag).toBe("foo");
    expect(event?.event).toBe("start");

    event = await pointer.next();
    expect(pointer.tagStack).toEqual(["foo", "bar"]);
    expect(pointer.depth).toBe(2);
    expect(event?.element.tag).toBe("bar");
    expect(event?.event).toBe("start");

    event = await pointer.next();
    expect(pointer.tagStack).toEqual(["foo", "bar", "herp"]);
    expect(pointer.depth).toBe(3);
    expect(event?.element.tag).toBe("herp");
    expect(event?.event).toBe("start");

    event = await pointer.next();
    expect(pointer.tagStack).toEqual(["foo", "bar"]);
    expect(pointer.depth).toBe(2);
    expect(event?.element.tag).toBe("herp");
    expect(event?.event).toBe("end");

    event = await pointer.next();
    expect(pointer.tagStack).toEqual(["foo"]);
    expect(pointer.depth).toBe(1);
    expect(event?.element.tag).toBe("bar");
    expect(event?.event).toBe("end");

    event = await pointer.next();
    expect(pointer.tagStack).toEqual(["foo", "derp"]);
    expect(pointer.depth).toBe(2);
    expect(event?.element.tag).toBe("derp");
    expect(event?.event).toBe("start");

    event = await pointer.next();
    expect(pointer.tagStack).toEqual(["foo"]);
    expect(pointer.depth).toBe(1);
    expect(event?.element.tag).toBe("derp");
    expect(event?.event).toBe("end");

    event = await pointer.next();
    expect(pointer.tagStack).toEqual([]);
    expect(pointer.depth).toBe(0);
    expect(event?.element.tag).toBe("foo");
    expect(event?.event).toBe("end");

    expect(await pointer.next()).toBe(null);
  });

  it("test_iterator", async () => {
    const fooElement = await ElementIterator.fromFile(stream(TEST_XML));
    const fooIterator = fooElement[Symbol.asyncIterator]();

    const barElement = (await fooIterator.next()).value;
    const barIterator = barElement[Symbol.asyncIterator]();
    expect(barElement.tag).toBe("bar");

    const herpElement = (await barIterator.next()).value;
    expect(herpElement.tag).toBe("herp");
    expect(await herpElement.text()).toBe("content");

    const derpElement = (await fooIterator.next()).value;
    expect(derpElement.tag).toBe("derp");
    expect(derpElement.attr("foo")).toBe("bar");
  });

  it("test_skipping_iterator", async () => {
    const fooElement = await ElementIterator.fromFile(stream(TEST_XML));
    const fooIterator = fooElement[Symbol.asyncIterator]();

    await fooIterator.next();

    const derpElement = (await fooIterator.next()).value;
    expect(derpElement.tag).toBe("derp");
    expect(derpElement.attr("foo")).toBe("bar");
  });
});
