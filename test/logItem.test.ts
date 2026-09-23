import { describe, expect, it } from "vitest";

import { ElementIterator } from "../src/elementIterator.js";
import { LogItem } from "../src/model/logItem.js";
import { Namespace } from "../src/model/namespace.js";
import { Timestamp } from "../src/model/timestamp.js";

describe("log_item", () => {
  it("test_log_item", async () => {
    const XML = `
    <logitem>
        <id>6</id>
        <timestamp>2004-12-23T03:34:26Z</timestamp>
        <contributor>
            <username>Brockert</username>
            <id>50095</id>
        </contributor>
        <comment>content was: '#redirect [[Template:UserBrockert]]', an old experiment of mine, now being moved around by bots</comment>
        <type>delete</type>
        <action>delete</action>
        <logtitle>Template:UserBrockert</logtitle>
        <params xml:space="preserve" />
    </logitem>
    `;
    const namespaceMap = {
      Template: new Namespace(10, "Template"),
    };
    const logItem = await LogItem.fromElement(
      await ElementIterator.fromString(XML),
      namespaceMap,
    );
    expect(logItem.id).toBe(6);
    expect(logItem.timestamp?.equals(
      new Timestamp("2004-12-23T03:34:26Z"))).toBe(true);
    expect(logItem.comment).toBe(
      "content was: '#redirect [[Template:UserBrockert]]', an old " +
        "experiment of mine, now being moved around by bots",
    );
    expect(logItem.user).not.toBe(null);
    expect(logItem.user?.id).toBe(50095);
    expect(logItem.user?.text).toBe("Brockert");
    expect(logItem.page).not.toBe(null);
    expect(logItem.page?.namespace).toBe(10);
    expect(logItem.page?.title).toBe("UserBrockert");
    expect(logItem.type).toBe("delete");
    expect(logItem.action).toBe("delete");
    expect(logItem.params).toBe(null);
    expect(logItem.deleted).not.toBe(null);
    expect(logItem.deleted?.action).toBe(null);
    expect(logItem.deleted?.user).toBe(false);
    expect(logItem.deleted?.comment).toBe(false);
    expect(logItem.deleted?.restricted).toBe(null);

    const NULL_TITLE_XML = `
    <logitem>
        <id>6</id>
        <timestamp>2004-12-23T03:34:26Z</timestamp>
        <contributor>
            <username>Brockert</username>
            <id>50095</id>
        </contributor>
        <comment>content was: '#redirect [[Template:UserBrockert]]', an old experiment of mine, now being moved around by bots</comment>
        <type>delete</type>
        <action>delete</action>
        <logtitle />
        <params xml:space="preserve" />
    </logitem>
    `;
    const nullTitleItem = await LogItem.fromElement(
      await ElementIterator.fromString(NULL_TITLE_XML),
    );
    expect(nullTitleItem.page).not.toBe(null);
    expect(nullTitleItem.page?.namespace).toBe(null);
    expect(nullTitleItem.page?.title).toBe(null);
  });
});
