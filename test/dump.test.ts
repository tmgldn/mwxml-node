import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";

import { Dump } from "../src/dump.js";
import { LogItem } from "../src/model/logItem.js";
import { Page } from "../src/model/page.js";
import { Revision } from "../src/model/revision.js";
import { Timestamp } from "../src/model/timestamp.js";
import { nextItem } from "../src/util.js";

const SAMPLE_XML = `
<mediawiki xmlns="http://www.mediawiki.org/xml/export-0.8/"
           xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
           xsi:schemaLocation="http://www.mediawiki.org/xml/export-0.8/
                               http://www.mediawiki.org/xml/export-0.8.xsd"
           version="0.8" xml:lang="en">
  <siteinfo>
    <sitename>Wikipedia</sitename>
    <base>http://en.wikipedia.org/wiki/Main_Page</base>
    <generator>MediaWiki 1.22wmf2</generator>
    <case>first-letter</case>
    <namespaces>
      <namespace key="0" case="first-letter" />
      <namespace key="1" case="first-letter">Talk</namespace>
    </namespaces>
  </siteinfo>
  <page>
    <title>Foo</title>
    <ns>0</ns>
    <id>1</id>
    <revision>
      <id>1</id>
      <timestamp>2004-08-09T09:04:08Z</timestamp>
    </revision>
    <revision>
      <id>2</id>
      <timestamp>2004-08-10T09:04:08Z</timestamp>
    </revision>
  </page>
  <page>
    <title>Talk:Bar</title>
    <ns>1</ns>
    <id>2</id>
    <redirect title="Computer accessibility" />
    <restrictions>edit=sysop:move=sysop</restrictions>
    <revision>
      <id>3</id>
      <timestamp>2004-08-11T09:04:08Z</timestamp>
    </revision>
    <revision>
      <id>4</id>
      <timestamp>2004-08-12T09:04:08Z</timestamp>
    </revision>
  </page>
</mediawiki>`;

describe("dump", () => {
  it("test_complete", async () => {
    const dump = await Dump.fromFile(Readable.from([SAMPLE_XML]));
    expect(dump.siteInfo.namespaces?.map((ns) => ns.id)).toEqual([0, 1]);

    let page = await nextItem(dump);
    expect(page?.title).toBe("Foo");
    expect(page?.namespace).toBe(0);
    expect(page?.id).toBe(1);
    expect(page?.redirect).toBe(null);
    expect(page?.restrictions).toEqual([]);

    let revision = await nextItem(page as Page);
    expect(revision?.id).toBe(1);
    expect(revision?.timestamp?.equals(
      new Timestamp("2004-08-09T09:04:08Z"))).toBe(true);

    revision = await nextItem(page as Page);
    expect(revision?.id).toBe(2);
    expect(revision?.timestamp?.equals(
      new Timestamp("2004-08-10T09:04:08Z"))).toBe(true);

    page = await nextItem(dump);
    expect(page).toBeInstanceOf(Page);
    expect(page?.title).toBe("Talk:Bar");
    expect(page?.namespace).toBe(1);
    expect(page?.id).toBe(2);
    expect(page?.redirect).toBe("Computer accessibility");
    expect(page?.restrictions).toEqual(["edit=sysop:move=sysop"]);

    revision = await nextItem(page as Page);
    expect(revision).toBeInstanceOf(Revision);
    expect(revision?.id).toBe(3);
    expect(revision?.timestamp?.equals(
      new Timestamp("2004-08-11T09:04:08Z"))).toBe(true);

    revision = await nextItem(page as Page);
    expect(revision).toBeInstanceOf(Revision);
    expect(revision?.id).toBe(4);
    expect(revision?.timestamp?.equals(
      new Timestamp("2004-08-12T09:04:08Z"))).toBe(true);
  });

  it("test_skipping", async () => {
    const dump = await Dump.fromFile(Readable.from([SAMPLE_XML]));

    let page = await nextItem(dump);
    expect(page?.title).toBe("Foo");
    expect(page?.namespace).toBe(0);
    expect(page?.id).toBe(1);

    page = await nextItem(dump);
    expect(page?.title).toBe("Talk:Bar");
    expect(page?.namespace).toBe(1);
    expect(page?.id).toBe(2);

    const revision = await nextItem(page as Page);
    expect(revision?.id).toBe(3);
    expect(revision?.timestamp?.equals(
      new Timestamp("2004-08-11T09:04:08Z"))).toBe(true);
  });

  it("test_from_page_xml", async () => {
    const pageXml = `
    <page>
      <title>Foo</title>
      <ns>0</ns>
      <id>1</id>
      <revision>
        <id>1</id>
        <timestamp>2004-08-09T09:04:08Z</timestamp>
      </revision>
      <revision>
        <id>2</id>
        <timestamp>2004-08-10T09:04:08Z</timestamp>
      </revision>
    </page>
    `;

    const dump = await Dump.fromPageXml(pageXml);

    // You have a `namespaces`, but it's empty.
    expect(dump.siteInfo.namespaces).toBe(null);

    const page = await nextItem(dump);
    expect(page?.title).toBe("Foo");
    expect(page?.namespace).toBe(0);
    expect(page?.id).toBe(1);

    let revision = await nextItem(page as Page);
    expect(revision?.id).toBe(1);
    expect(revision?.timestamp?.equals(
      new Timestamp("2004-08-09T09:04:08Z"))).toBe(true);

    revision = await nextItem(page as Page);
    expect(revision?.id).toBe(2);
    expect(revision?.timestamp?.equals(
      new Timestamp("2004-08-10T09:04:08Z"))).toBe(true);
  });

  const OLD_XML = `
<mediawiki xmlns="http://www.mediawiki.org/xml/export-0.8/"
           xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
           xsi:schemaLocation="http://www.mediawiki.org/xml/export-0.8/
                               http://www.mediawiki.org/xml/export-0.8.xsd"
           version="0.8" xml:lang="en">
  <siteinfo>
    <sitename>Wikipedia</sitename>
    <base>http://en.wikipedia.org/wiki/Main_Page</base>
    <generator>MediaWiki 1.22wmf2</generator>
    <case>first-letter</case>
    <namespaces>
      <namespace key="0" case="first-letter" />
      <namespace key="1" case="first-letter">Talk</namespace>
    </namespaces>
  </siteinfo>
  <page>
    <title>Talk:Foo</title>
    <id>1</id>
    <revision>
      <id>1</id>
      <timestamp>2004-08-09T09:04:08Z</timestamp>
    </revision>
    <revision>
      <id>2</id>
      <timestamp>2004-08-10T09:04:08Z</timestamp>
    </revision>
  </page>
</mediawiki>`;

  it("test_old_dump", async () => {
    const dump = await Dump.fromFile(Readable.from([OLD_XML]));

    const page = await nextItem(dump);

    expect(page?.namespace).toBe(1);
  });

  const LOG_XML = `
<mediawiki xmlns="http://www.mediawiki.org/xml/export-0.8/"
           xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
           xsi:schemaLocation="http://www.mediawiki.org/xml/export-0.8/
                               http://www.mediawiki.org/xml/export-0.8.xsd"
           version="0.8" xml:lang="en">
  <siteinfo>
    <sitename>Wikipedia</sitename>
    <base>http://en.wikipedia.org/wiki/Main_Page</base>
    <generator>MediaWiki 1.22wmf2</generator>
    <case>first-letter</case>
    <namespaces>
      <namespace key="0" case="first-letter" />
      <namespace key="1" case="first-letter">Talk</namespace>
    </namespaces>
  </siteinfo>
  <logitem>
    <id>1</id>
    <timestamp>2004-12-23T03:20:32Z</timestamp>
    <contributor>
      <username>Slowking Man</username>
      <id>56299</id>
    </contributor>
    <comment>content was: '[[Media:Example.og[http://www.example.com link title][http://www.example.com link title]''Italic text'''''Bold text'''jjhkjhkjhkjhkjhjggghg]]'</comment>
    <type>delete</type>
    <action>delete</action>
    <logtitle>Vivian Blaine</logtitle>
    <params xml:space="preserve" />
  </logitem>
  <logitem>
    <id>2</id>
    <timestamp>2004-12-23T03:24:26Z</timestamp>
    <contributor>
      <username>Fredrik</username>
      <id>26675</id>
    </contributor>
    <comment>{{GFDL}} {{cc-by-sa-2.0}}</comment>
    <type>upload</type>
    <action>upload</action>
    <logtitle>File:Mini Christmas tree.png</logtitle>
    <params xml:space="preserve" />
  </logitem>
</mediawiki>`;

  it("test_log_dump", async () => {
    const dump = await Dump.fromFile(Readable.from([LOG_XML]));

    const logItem = await nextItem(dump);
    expect(logItem).toBeInstanceOf(LogItem);
    expect(logItem?.id).toBe(1);

    const secondItem = await nextItem(dump);
    expect(secondItem?.id).toBe(2);
  });
});
