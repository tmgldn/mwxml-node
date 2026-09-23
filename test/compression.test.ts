import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync } from "node:fs";

import { Dump } from "../src/dump.js";

const DUMP_XML_PATH = new URL("./fixtures/dump.xml", import.meta.url).pathname;
const DUMP_BZ2_PATH = new URL("./fixtures/dump.xml.bz2", import.meta.url)
  .pathname;

async function countRevisions(path: string): Promise<number> {
  const dump = await Dump.fromFile(path);
  let revisions = 0;
  for await (const page of dump) {
    for await (const revision of page) {
      void revision;
      revisions += 1;
    }
  }
  return revisions;
}

describe("compression", () => {
  it("test_plain_file", async () => {
    expect(await countRevisions(DUMP_XML_PATH)).toBe(3);
  });

  it("test_gzip", async () => {
    const gzPath = join(tmpdir(), "mwxml-test-dump.xml.gz");
    writeFileSync(gzPath, gzipSync(await readFile(DUMP_XML_PATH)));
    expect(await countRevisions(gzPath)).toBe(3);
  });

  it("test_bz2", async () => {
    expect(await countRevisions(DUMP_BZ2_PATH)).toBe(3);
  });
});
