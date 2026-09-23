#!/usr/bin/env node
/**
 * Validates that the built package works for basic, regular usage: the
 * `mwxml` CLI binary converts a dump fixture to revision documents, and the
 * library entry point parses and iterates the same dump.  Run by
 * `npm run check-build` (before a release, after `build` and `test`).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const distIndex = path.join(root, "dist", "index.js");
const distCli = path.join(root, "dist", "cli", "main.js");
const fixture = path.join(root, "test", "fixtures", "dump.xml");

function checkBuildOutput() {
  if (!existsSync(distIndex) || !existsSync(distCli)) {
    throw new Error(
      "dist/ is missing or incomplete — run `npm run build` first.",
    );
  }
}

function checkCli() {
  const result = spawnSync(distCli, ["dump2revdocs", fixture], {
    encoding: "utf8",
  });

  assert.strictEqual(result.status, 0, `CLI exited with an error:\n${result.stderr}`);
  assert.strictEqual(result.stderr, "", "CLI wrote to stderr");

  const docs = result.stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

  assert.strictEqual(docs.length, 3, "expected 3 revision documents");
  assert.deepStrictEqual(
    docs.map((doc) => doc.id),
    [1, 2, 3],
  );

  const [first] = docs;
  assert.strictEqual(first.timestamp, "2004-08-09T09:04:08Z");
  assert.strictEqual(first.page.title, "Foo");
  assert.strictEqual(first.user.id, 92182);
  assert.strictEqual(first.user.text, "Gen0cide");
  assert.strictEqual(first.slots.contents.main.text, "Revision 1 text");

  const second = docs[1];
  assert.strictEqual(second.user.id, undefined, "IP-only contributor has no id");
  assert.strictEqual(second.user.text, "222.152.210.109");

  const third = docs[2];
  assert.strictEqual(third.page.title, "Bar");
  assert.strictEqual(third.page.namespace, 1);
}

async function checkLibrary() {
  const mw = await import(pathToFileURL(distIndex).href);

  const dump = await mw.Dump.fromFile(fixture);
  assert.strictEqual(dump.siteInfo.name, "Wikipedia");
  assert.deepStrictEqual(
    dump.siteInfo.namespaces?.map((ns) => ns.id),
    [0, 1],
  );

  const pages = [];
  for await (const page of dump) {
    const revisions = [];
    for await (const revision of page) {
      assert.strictEqual(revision.page, page, "revision.page is not its page");
      revisions.push(revision);
    }
    pages.push([page, revisions]);
  }

  assert.strictEqual(pages.length, 2, "expected 2 pages");
  const [[pageFoo, revisionsFoo], [pageBar, revisionsBar]] = pages;
  assert.strictEqual(pageFoo.title, "Foo");
  assert.strictEqual(revisionsFoo.length, 2);
  assert.strictEqual(revisionsFoo[0].id, 1);
  assert.strictEqual(revisionsFoo[0].text, "Revision 1 text");
  assert.strictEqual(pageBar.title, "Bar");
  assert.strictEqual(revisionsBar.length, 1);
  assert.strictEqual(revisionsBar[0].id, 3);
}

try {
  checkBuildOutput();
  checkCli();
  await checkLibrary();
  console.log("check-build: OK");
} catch (error) {
  console.error(`check-build: FAILED\n${String(error)}`);
  process.exit(1);
}
