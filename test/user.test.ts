import { describe, expect, it } from "vitest";

import { ElementIterator } from "../src/elementIterator.js";
import { User } from "../src/model/user.js";

describe("user", () => {
  it("test_user", async () => {
    let XML = `
    <contributor>
      <username>Gen0cide</username>
      <id>92182</id>
    </contributor>
    `;
    let user = await User.fromElement(await ElementIterator.fromString(XML));
    expect(user.id).toBe(92182);
    expect(user.text).toBe("Gen0cide");

    XML = `
    <contributor>
      <ip>192.168.0.1</ip>
    </contributor>
    `;
    user = await User.fromElement(await ElementIterator.fromString(XML));
    expect(user.id).toBe(null);
    expect(user.text).toBe("192.168.0.1");

    XML = `
    <contributor>
      <username></username>
      <id></id>
    </contributor>
    `;
    user = await User.fromElement(await ElementIterator.fromString(XML));
    expect(user.id).toBe(0);
    expect(user.text).toBe("None");
  });
});
