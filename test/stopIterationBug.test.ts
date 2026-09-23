import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";

import { Dump } from "../src/dump.js";

// Sample XML with valid MediaWiki structure
const MINIMAL_XML = `
<mediawiki xmlns="http://www.mediawiki.org/xml/export-0.10/">
  <siteinfo>
    <sitename>Wikipedia</sitename>
    <dbname>enwiki</dbname>
  </siteinfo>
  <page>
    <title>Test Page</title>
    <ns>0</ns>
    <id>1</id>
    <revision>
      <id>100</id>
      <timestamp>2021-01-01T00:00:00Z</timestamp>
      <text>Test content</text>
    </revision>
  </page>
</mediawiki>
`;

const MULTI_PAGE_XML = `
<mediawiki xmlns="http://www.mediawiki.org/xml/export-0.10/">
  <siteinfo>
    <sitename>Wikipedia</sitename>
    <dbname>enwiki</dbname>
  </siteinfo>
  <page>
    <title>Page 1</title>
    <ns>0</ns>
    <id>1</id>
    <revision>
      <id>100</id>
      <timestamp>2021-01-01T00:00:00Z</timestamp>
      <text>Content 1</text>
    </revision>
  </page>
  <page>
    <title>Page 2</title>
    <ns>0</ns>
    <id>2</id>
    <revision>
      <id>200</id>
      <timestamp>2021-01-02T00:00:00Z</timestamp>
      <text>Content 2</text>
    </revision>
  </page>
</mediawiki>
`;

/**
 * The async equivalent of the StopIteration bug fixed in the Python library:
 * a stream exhausted mid-iteration must complete the iteration normally
 * instead of raising.
 */
describe("stop_iteration_bug", () => {
  it("test_stopiteration_bug_reproduction", async () => {
    const dump = await Dump.fromFile(Readable.from([MINIMAL_XML]));

    const pages = [];
    for await (const page of dump) {
      pages.push(page);
    }
    expect(pages.length).toBe(1);
    expect(pages[0].title).toBe("Test Page");
  });

  it("test_iteration_completes_normally", async () => {
    const dump = await Dump.fromFile(Readable.from([MINIMAL_XML]));

    const pages = [];
    for await (const page of dump) {
      pages.push(page);
    }

    expect(pages.length).toBe(1);
    expect(pages[0].title).toBe("Test Page");
    expect(pages[0].id).toBe(1);
    expect(pages[0].namespace).toBe(0);
  });

  it("test_multiple_pages_iteration", async () => {
    const dump = await Dump.fromFile(Readable.from([MULTI_PAGE_XML]));

    const pages = [];
    for await (const page of dump) {
      pages.push(page);
    }

    expect(pages.length).toBe(2);
    expect(pages[0].title).toBe("Page 1");
    expect(pages[0].id).toBe(1);
    expect(pages[1].title).toBe("Page 2");
    expect(pages[1].id).toBe(2);
  });

  it("test_iteration_with_generator_pattern", async () => {
    const dump = await Dump.fromFile(Readable.from([MULTI_PAGE_XML]));

    const pageTitles: string[] = [];
    for await (const page of dump) {
      pageTitles.push(page.title as string);
    }

    expect(pageTitles).toEqual(["Page 1", "Page 2"]);
  });

  it("test_empty_dump_iteration", async () => {
    const emptyXml = `
    <mediawiki xmlns="http://www.mediawiki.org/xml/export-0.10/">
      <siteinfo>
        <sitename>Wikipedia</sitename>
        <dbname>enwiki</dbname>
      </siteinfo>
    </mediawiki>
    `;

    const dump = await Dump.fromFile(Readable.from([emptyXml]));

    const pages = [];
    for await (const page of dump) {
      pages.push(page);
    }

    expect(pages.length).toBe(0);
  });

  it("test_partial_iteration", async () => {
    const dump = await Dump.fromFile(Readable.from([MULTI_PAGE_XML]));

    let firstPage = null;
    for await (const page of dump) {
      firstPage = page;
      break;
    }

    expect(firstPage).not.toBe(null);
    expect(firstPage?.title).toBe("Page 1");
  });
});
