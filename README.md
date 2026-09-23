# node-mwxml

A Node.js/TypeScript port of
[python-mwxml](https://github.com/mediawiki-utilities/python-mwxml): a set of
utilities for efficiently processing MediaWiki's XML database dumps.

The package is written in TypeScript, published as ESM, and mirrors the Python
API using JS naming conventions (camelCase fields, PascalCase classes). The
streaming parser is fully lazy: pages and revisions are parsed on demand as
you iterate, so arbitrarily large dumps can be processed with constant
memory.

## Install

```
npm install node-mwxml
```

## Usage

```ts
import { Dump } from "node-mwxml";

// Accepts a path (plain, .gz or .bz2 — compression is detected by sniffing
// the file's magic bytes) or any stream / async iterable of chunks.
const dump = await Dump.fromFile("example/dump.xml");

for await (const page of dump) {
  for await (const revision of page) {
    console.log(revision.id, page.title);
  }
}
```

`Dump` also provides `dump.siteInfo` (`SiteInfo`), `dump.items`,
`dump.pages` and `dump.logItems`.

### `map()`

Distributes a dump processing function over a set of dump files with
concurrency, yielding results in input order:

```ts
import { map } from "node-mwxml";

async function* pageInfo(dump, path) {
  for await (const page of dump) {
    yield { id: page.id, namespace: page.namespace, title: page.title };
  }
}

for await (const doc of map(pageInfo, ["dump1.xml", "dump2.xml.gz"], 4)) {
  console.log(doc);
}
```

### `mapWorker()`

Like `map()`, but distributes the work across real worker threads
(`node:worker_threads`), so several dumps parse in parallel on separate
cores. Because functions cannot cross a thread boundary, the processor is
given as a module URL (or absolute path) exporting an async generator, and
the paths must be real files:

```ts
import { mapWorker } from "node-mwxml";

// processor.mjs:
// export default async function* (dump, path) { ... }
const processor = new URL("./processor.mjs", import.meta.url);

for await (const doc of mapWorker(processor, ["dump1.xml", "dump2.xml.gz"], 4)) {
  console.log(doc);
}
```

Like `map()`, results are yielded in the order the paths were given and
errors raised by a processor surface when its path's results are reached.
Workers are terminated if the iteration is abandoned early.

### CLI

The package ships a `node-mwxml` binary mirroring the Python utilities:

```
node-mwxml dump2revdocs <dump.xml>... [--output=<dir>] [--threads=<num>] [--compress=gz|none] [--verbose]
node-mwxml inflate <flat-rev-docs.jsonl>...
node-mwxml normalize <rev-docs.jsonl>...
node-mwxml validate <rev-docs.jsonl>... --schema=<schema.json>
```

With `--threads=<num>` and an `--output` directory, `dump2revdocs` processes
the input files across that many real worker threads.

## API mapping

| Python | This package |
| --- | --- |
| `mwxml.Dump.from_file(f)` | `await Dump.fromFile(f)` |
| `mwxml.Dump.from_page_xml(xml)` | `await Dump.fromPageXml(xml)` |
| `for page in dump` | `for await (const page of dump)` |
| `for rev in page` | `for await (const rev of page)` |
| `dump.site_info`, `dump.pages`, `dump.log_items` | `dump.siteInfo`, `dump.pages`, `dump.logItems` |
| `revision.parent_id`, `rev.text`, `rev.sha1` | `revision.parentId`, `revision.text`, `revision.sha1` |
| `revision.timestamp` (mwtypes Timestamp) | `revision.timestamp` (`Timestamp`, use `.equals()` and `<`/`>`) |
| `mwxml.map(process, paths, threads)` | `map(process, paths, threads)` (async generator) |
| `revision.to_json()` | `revision.toJSON()` |
| `next(dump)` | `nextItem(dump)` (exported helper) |

## Behaviour notes

- **Bug compatibility.** Two quirks of the Python library are replicated
  deliberately and documented here:
  - `dump.items`, `dump.pages` and `dump.logItems` share a single
    underlying iterator — consuming any of them consumes the others.
  - When a `<logitem>` contains a non-empty `<logtitle>` and the dump has no
    `<namespaces>` block, the page title is read from the `<logitem>`
    element itself instead of the `<logtitle>` element. Reading it completes
    the log item early, so any tags that follow (`<type>`, `<action>`,
    `<params>`) are skipped.
- **Coercion quirks** are preserved: `User.id` is numeric but `Content.id`
  is a string, `Content.origin`/`Content.bytes` are numeric, an empty
  `<text>` tag serialises as `null`, an empty `<username>` tag yields the
  string `"None"` (Python's `str(None)`), and an empty `<id>` inside a
  `<contributor>` yields `0`.
- **JSON keys.** `toJSON()` emits camelCase keys (`parentId`), per JS
  conventions. The `normalize` and `inflate` CLI subcommands operate on the
  legacy snake_case revision-document format of the Python ecosystem, as
  their purpose is normalising those legacy documents.
- **Serialization.** Like Python's `jsonable`, `toJSON()` drops `null`
  fields from objects (but keeps `false`, `0` and `[]`) and serialises
  timestamps as `YYYY-MM-DDTHH:MM:SSZ` strings.
- **Divergences from Python:**
  - bzip2 *compression* of CLI output is not supported (bzip2 *reading* is,
    via the optional `unbzip2-stream` dependency); use `--compress=gz`.
  - `dump2revdocs --threads=<num>` spawns real worker threads when writing
    to an `--output` directory (Python streams merged ordered output to
    stdout instead); with stdout, or fewer than two inputs, inputs are
    processed sequentially in the order given.
  - Iterating a `Page`'s revisions part-way and then resuming (after the
    dump has moved on) yields the remaining revisions; in Python the
    generator is closed by garbage collection and yields nothing.
  - `Dump` constructed with `null` items yields nothing from
    `dump.pages`/`dump.logItems`; Python raises a `TypeError` in that case.

## Performance

Benchmark: counting the articles (pages) in 8 parts (~3.4 GB compressed
bzip2) of the `enwiki-20260901-pages-articles-multistream` dump, on a
16-core machine with a warm page cache. "1 thread" is plain sequential
iteration; "8 threads" is this package's `mapWorker()` versus
python-mwxml's `mwxml.map` (which uses multiprocessing under the hood).
Both implementations counted the same 3,498,127 pages in every run.

| Implementation | 1 thread | 8 threads |
| --- | --- | --- |
| node-mwxml | 2.8 MB/s | 22.0 MB/s |
| python-mwxml 0.3.8 | 4.5 MB/s | 31.7 MB/s |

(Throughput is in compressed MB/s; the uncompressed XML is roughly 5x
larger.) python-mwxml is faster single-threaded — its C `bz2` module
out-paces the pure-JavaScript `unbzip2-stream` decoder, which dominates
this benchmark — but node-mwxml scales slightly better with threads
(7.8x vs 7.0x), narrowing the gap to ~1.4x at 8 threads. Reading gzip
or plain XML dumps avoids the bzip2 bottleneck entirely.

## Development

```
npm install
npm test      # vitest
npm run build # tsc -> dist/
```

The test suite is a 1:1 port of the Python library's suite (plus timestamp
and compression tests), and the parser's output has been verified
field-for-field against `python-mwxml` 0.3.8.

