You are working on mwxml: the Node/TypeScript equivalent of the Python MediaWiki XML dump parser.

TypeScript, ESM, npm-publishable. Same API as the Python library, using TS/JS camelCase/PascalCase conventions.

The original project is https://github.com/mediawiki-utilities/python-mwxml and is available locally in `./python-mwxml` (gitignored) as the reference implementation.

## Status

The port is complete and verified: the test suite is a 1:1 port of the Python suite, `revision.to_json()` output has been verified field-for-field against `python-mwxml` 0.3.8 (installed from PyPI), and the bug-compat behaviors match it exactly. `mwxml` is free on npm. Do not re-plan from scratch — make changes against the existing implementation.

## Layout

- `src/elementIterator.ts` — `EventPointer` + `ElementIterator` over saxes (the streaming engine; pull-based, demand-driven)
- `src/dump.ts` — `Dump` (+ `fromFile`/`fromPageXml`); `src/map.ts` — parallel `map()`
- `src/files.ts` — compression sniffing (gzip via `node:zlib`, bz2 via optional `unbzip2-stream`), `concat`, `writer`
- `src/model/` — data model classes with their `fromElement` parsers and `toJSON`
- `src/cli/` — `mwxml` bin: `dump2revdocs`, `inflate`, `normalize`, `validate`
- `test/` — vitest suite (1:1 Python port + timestamp/compression tests), fixtures in `test/fixtures/`
- `scripts/check-build.mjs` — validates the built `dist/` output

## Decisions to preserve

- **Bug compatibility** (deliberate, do not "fix"): `dump.items`/`pages`/`logItems` share one underlying iterator; a non-empty `<logtitle>` with no `<namespaces>` block reads the title from the `<logitem>` element itself, which completes the log item and skips remaining tags.
- **Coercion quirks** (deliberate): empty `<username>` → `"None"` (Python `str(None)`), empty contributor `<id>` → `0`, empty `<text>` → `null`, `User.id`/`Content.origin`/`Content.bytes`/`parentId` numeric but `Content.id` a string.
- **`toJSON()`**: camelCase keys; drops `null` fields but keeps `false`/`0`/`[]`; timestamps as `YYYY-MM-DDTHH:MM:SSZ` strings. The `inflate`/`normalize` CLI subcommands operate on legacy snake_case revision documents — that is their purpose.
- **Async text**: Python's `.text` property drains the element, so it became `await element.text()`.
- **Shared generators** (`Dump`, `Page`, `ElementIterator`): wrappers pull via explicit `next()` so breaking out of a `for await` leaves the underlying generator suspended and resumable (Python `next()` parity). Do not switch these to `yield*`.
- **Dependencies**: keep them minimal. Runtime deps are `saxes` (SAX) and `ajv` (CLI `validate` only). Concurrency in `map()` uses the inline `Semaphore` in `src/map.ts` — p-limit was deliberately removed; do not reintroduce it (or any dep) for this. `unbzip2-stream` stays an optional dependency.

## Commands

- `npm run build` — tsc to `dist/` (+ executable bit on the bin)
- `npm test` (vitest) and `bun test` — **both must stay green**
- `npm run check-build` — exercises the built bin + library entry against `test/fixtures/dump.xml`
- `npm run release` — pub-time (checks, semantic version from `v#.#.#` tags, build/test/check-build, publish)

## Test-writing notes

- Tests must be compatible with both vitest and bun. Notably bun's `.rejects` requires an actual Promise — pass `(async () => { ... })()`, not a function.
- `expect.unreachable()` works in both runners.
- Python behaviour questions should be settled against `./python-mwxml` (or `pip install mwxml` in a venv), not from memory.
