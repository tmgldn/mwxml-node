import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";

import { map, type DumpProcessor } from "../src/map.js";
import type { Json } from "../src/json.js";

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
    <title>Foo:Bar</title>
    <ns>1</ns>
    <id>2</id>
    <revision>
      <id>3</id>
      <timestamp>2004-08-11T09:04:08Z</timestamp>
    </revision>
  </page>
</mediawiki>`;

describe("map", () => {
  it("test_map", async () => {
    const f = Readable.from([SAMPLE_XML]);

    const processDump: DumpProcessor<{ [key: string]: Json }> =
      async function * (dump) {
        for await (const page of dump) {
          let revisions = 0;
          for await (const _ of page) {
            revisions += 1;
          }
          yield { pageId: page.id, revisions };
        }
      };

    let pages = 0;
    for await (const doc of map(processDump, [f])) {
      const pageId = doc.pageId;
      const revisions = doc.revisions;
      if (pageId === 1) {
        expect(revisions).toBe(2);
      } else if (pageId === 2) {
        expect(revisions).toBe(1);
      } else {
        expect.unreachable();
      }

      pages += 1;
    }

    expect(pages).toBe(2);
  });

  it("test_map_error", async () => {
    const f = Readable.from([SAMPLE_XML]);

    const processDump = async function * (dump: unknown) {
      void dump;
    };

    await expect((async () => {
      // @ts-expect-error Intentionally wrong argument order (as in the
      // Python test): the processor must be a function.
      for await (const doc of map([f], processDump)) {
        void doc;
      }
    })()).rejects.toThrow(TypeError);
  });

  it("test_map_error_handler", async () => {
    const f = Readable.from([SAMPLE_XML]);

    const processDump: DumpProcessor<{ [key: string]: Json }> =
      async function * (dump) {
        for await (const page of dump) {
          let count = 0;

          for await (const _ of page) {
            count += 1;
          }

          if (count > 2) {
            throw new TypeError("Fake type error.");
          }

          yield { pageId: page.id, revisions: count };
        }
      };

    let pages = 0;
    for await (const doc of map(processDump, [f])) {
      const pageId = doc.pageId;
      const revisions = doc.revisions;
      if (pageId === 1) {
        expect(revisions).toBe(2);
      } else if (pageId === 2) {
        expect(revisions).toBe(1);
      } else {
        expect.unreachable();
      }

      pages += 1;
    }

    expect(pages).toBe(2);
  });

  it("test_complex_error_handler", async () => {
    const fClean = Readable.from([`
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
            </mediawiki>
        `]);
    const fMessy = Readable.from([`
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
                <title>Bar</title>
                <ns>0</ns>
                <id>2</id>
                <revision>
                  <id>3</id>
                  <timestamp>MESSY</timestamp>
                </revision>
                <revision>
                  <id>4</id>
                  <timestamp>2004-08-10T09:04:08Z</timestamp>
                </revision>
              </page>
            </mediawiki>
        `]);

    const processDump: DumpProcessor<unknown> = async function * (dump) {
      for await (const page of dump) {
        for await (const revision of page) {
          yield revision;
        }
      }
    };

    await expect((async () => {
      for await (const rev of map(processDump, [fMessy, fClean], 1)) {
        console.log(JSON.stringify(rev));
      }
    })()).rejects.toThrow("not a valid Wikipedia date format");
  });
});
