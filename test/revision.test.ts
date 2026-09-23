import { describe, expect, it } from "vitest";

import { ElementIterator } from "../src/elementIterator.js";
import { Revision } from "../src/model/revision.js";
import { Timestamp } from "../src/model/timestamp.js";

describe("revision", () => {
  it("test_old_revision", async () => {
    let XML = `
    <revision>
      <id>233192</id>
      <timestamp>2001-01-21T02:12:21Z</timestamp>
      <contributor>
        <username>RoseParks</username>
        <id>99</id>
      </contributor>
      <comment>*</comment>
      <minor />
      <model>wikitext</model>
      <format>text/x-wiki</format>
      <text xml:space="preserve">Text of rev 233192</text>
      <sha1>8kul9tlwjm9oxgvqzbwuegt9b2830vw</sha1>
    </revision>
    `;
    let revision = await Revision.fromElement(
      await ElementIterator.fromString(XML),
    );
    expect(revision.id).toBe(233192);
    expect(revision.timestamp?.equals(
      new Timestamp("2001-01-21T02:12:21Z"))).toBe(true);
    expect(revision.user?.id).toBe(99);
    expect(revision.user?.text).toBe("RoseParks");
    expect(revision.comment).toBe("*");
    expect(revision.minor).toBe(true);
    expect(revision.model).toBe("wikitext");
    expect(revision.format).toBe("text/x-wiki");
    expect(revision.text).toBe("Text of rev 233192");
    expect(revision.sha1).toBe("8kul9tlwjm9oxgvqzbwuegt9b2830vw");
    expect(revision.deleted?.text).toBe(false);
    expect(revision.deleted?.comment).toBe(false);
    expect(revision.deleted?.user).toBe(false);

    XML = `
    <revision>
      <id>233192</id>
      <timestamp>2001-01-21T02:12:21Z</timestamp>
      <contributor deleted="deleted"></contributor>
      <comment deleted="deleted" />
      <minor />
      <model>wikitext</model>
      <format>text/x-wiki</format>
      <text xml:space="preserve" deleted="deleted" />
      <sha1>8kul9tlwjm9oxgvqzbwuegt9b2830vw</sha1>
    </revision>
    `;
    revision = await Revision.fromElement(
      await ElementIterator.fromString(XML),
    );
    expect(revision.user).toBe(null);
    expect(revision.comment).toBe(null);
    expect(revision.text).toBe(null);
    expect(revision.deleted?.text).toBe(true);
    expect(revision.deleted?.comment).toBe(true);
    expect(revision.deleted?.user).toBe(true);
  });

  it("test_new_revision", async () => {
    const XML = `
    <revision>
      <id>233192</id>
      <timestamp>2001-01-21T02:12:21Z</timestamp>
      <contributor>
        <username>RoseParks</username>
        <id>99</id>
      </contributor>
      <comment>*</comment>
      <minor />
      <model>wikitext</model>
      <format>text/x-wiki</format>
      <text sha1="8kul9tlwjm9oxgvqzbwuegt9b2830vw" deleted="deleted" xml:space="preserve">Text of rev 233192</text>
      <sha1>93284629347293</sha1>
      <content>
        <role>label_data</role>
        <origin>123</origin>
        <model>JadeEntity</model>
        <format>text/json</format>
        <id>1234</id>
        <text deleted="deleted" location="file://dev/null" bytes="234" sha1="ahgsvdjasvbdj3723">{"i_am": "json"}</text>
      </content>
    </revision>
    `;
    const revision = await Revision.fromElement(
      await ElementIterator.fromString(XML),
    );
    expect(revision.id).toBe(233192);
    expect(revision.timestamp?.equals(
      new Timestamp("2001-01-21T02:12:21Z"))).toBe(true);
    expect(revision.user?.id).toBe(99);
    expect(revision.user?.text).toBe("RoseParks");
    expect(revision.comment).toBe("*");
    expect(revision.minor).toBe(true);
    expect(revision.model).toBe("wikitext");
    expect(revision.format).toBe("text/x-wiki");
    expect(revision.text).toBe("Text of rev 233192");
    expect(revision.sha1).toBe("8kul9tlwjm9oxgvqzbwuegt9b2830vw");
    expect(revision.deleted?.text).toBe(true);
    expect(revision.deleted?.comment).toBe(false);
    expect(revision.deleted?.user).toBe(false);
    expect(revision.slots?.sha1).toBe("93284629347293");
    expect(revision.slots?.get("main")?.sha1)
      .toBe("8kul9tlwjm9oxgvqzbwuegt9b2830vw");
    expect(revision.slots?.get("main")?.text).toBe("Text of rev 233192");
    expect(revision.slots?.get("main")?.format).toBe("text/x-wiki");
    expect(revision.slots?.get("label_data")?.role).toBe("label_data");
    expect(revision.slots?.get("label_data")?.origin).toBe(123);
    expect(revision.slots?.get("label_data")?.model).toBe("JadeEntity");
    expect(revision.slots?.get("label_data")?.format).toBe("text/json");
    expect(revision.slots?.get("label_data")?.id).toBe("1234");
    expect(revision.slots?.get("label_data")?.deleted).toBe(true);
    expect(revision.slots?.get("label_data")?.location).toBe("file://dev/null");
    expect(revision.slots?.get("label_data")?.bytes).toBe(234);
    expect(revision.slots?.get("label_data")?.sha1).toBe("ahgsvdjasvbdj3723");
  });
});
