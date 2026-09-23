import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { mapWorker } from "../src/mapWorker.js";

// Workers are plain Node/Bun threads without the test runner's TypeScript
// transform, so the library they import must be the compiled build.  These
// tests therefore require `npm run build` first (check-build exercises them
// after every release build); without dist/ they are skipped.
const distUrl = new URL("../dist/index.js", import.meta.url);
const describeWithWorkers = existsSync(distUrl)
  ? describe
  : describe.skip;

function makeDumpXml(title: string, pageId: number, revisionIds: number[]) {
  const revisions = revisionIds
    .map(
      (id) => `
    <revision>
      <id>${id}</id>
      <timestamp>2004-08-${String(10 + id).padStart(2, "0")}T09:04:08Z</timestamp>
    </revision>`,
    )
    .join("");
  return `
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
    </namespaces>
  </siteinfo>
  <page>
    <title>${title}</title>
    <ns>0</ns>
    <id>${pageId}</id>${revisions}
  </page>
</mediawiki>`;
}

interface PageDoc {
  path: string;
  pageId: number;
  revisions: number;
}

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "mwxml-worker-"));
  const dump1 = join(dir, "dump1.xml");
  const dump2 = join(dir, "dump2.xml");
  writeFileSync(dump1, makeDumpXml("Foo", 1, [1, 2]));
  writeFileSync(dump2, makeDumpXml("Bar", 3, [4]));

  // The processor runs inside a worker thread, so it must be a real module.
  const processor = join(dir, "processor.mjs");
  writeFileSync(
    processor,
    [
      "export default async function *process(dump, path) {",
      "  for await (const page of dump) {",
      "    let revisions = 0;",
      "    for await (const revision of page) {",
      "      revisions += 1;",
      "    }",
      "    yield { path, pageId: page.id, revisions };",
      "  }",
      "}",
    ].join("\n"),
  );

  return { dir, dump1, dump2, processor };
}

describeWithWorkers("mapWorker", () => {
  it("test_map_worker", async () => {
    const { dump1, dump2, processor } = await setup();

    const docs: PageDoc[] = [];
    for await (const doc of
        mapWorker<PageDoc>(processor, [dump1, dump2], 2, { libUrl: distUrl })) {
      docs.push(doc);
    }

    // Results are yielded in the order the paths were given.
    expect(docs).toEqual([
      { path: dump1, pageId: 1, revisions: 2 },
      { path: dump2, pageId: 3, revisions: 1 },
    ]);
  });

  it("test_map_worker_named_export", async () => {
    const { dump1, dump2, dir } = await setup();
    const processor = join(dir, "namedProcessor.mjs");
    writeFileSync(
      processor,
      [
        "export async function *countRevisions(dump, path) {",
        "  let total = 0;",
        "  for await (const page of dump) {",
        "    for await (const revision of page) {",
        "      total += 1;",
        "    }",
        "  }",
        "  yield { path, total };",
        "}",
      ].join("\n"),
    );

    const docs: { path: string; total: number }[] = [];
    for await (const doc of
        mapWorker<{ path: string; total: number }>(
          processor, [dump1], 1, { libUrl: distUrl, export: "countRevisions" },
        )) {
      docs.push(doc);
    }

    expect(docs).toEqual([{ path: dump1, total: 2 }]);
    void dump2;
  });

  it("test_map_worker_error", async () => {
    const { dir, processor } = await setup();
    const dump = join(dir, "messy.xml");
    writeFileSync(dump, makeDumpXml("Messy", 1, [1]).replace(
      "<timestamp>2004-08-11T09:04:08Z</timestamp>",
      "<timestamp>MESSY</timestamp>",
    ));

    // The error is raised inside the worker and must surface when the
    // failing path's results are reached.
    await expect((async () => {
      for await (const doc of
          mapWorker<PageDoc>(processor, [dump], 1, { libUrl: distUrl })) {
        void doc;
      }
    })()).rejects.toThrow("not a valid Wikipedia date format");
  });
});
