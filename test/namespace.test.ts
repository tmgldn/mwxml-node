import { describe, expect, it } from "vitest";

import { ElementIterator } from "../src/elementIterator.js";
import { Namespace } from "../src/model/namespace.js";

describe("namespace", () => {
  it("test_namespace", async () => {
    let XML = '<namespace key="0" case="first-letter" />';
    let namespace = await Namespace.fromElement(
      await ElementIterator.fromString(XML),
    );
    expect(namespace.id).toBe(0);
    expect(namespace.name).toBe("");
    expect(namespace.aliases).toBe(null);
    expect(namespace.case).toBe("first-letter");
    expect(namespace.canonical).toBe(null);

    XML = '<namespace key="711" case="first-letter">TimedText talk</namespace>';
    namespace = await Namespace.fromElement(
      await ElementIterator.fromString(XML),
    );
    expect(namespace.id).toBe(711);
    expect(namespace.name).toBe("TimedText talk");
    expect(namespace.aliases).toBe(null);
    expect(namespace.case).toBe("first-letter");
    expect(namespace.canonical).toBe(null);
  });
});
