#!/usr/bin/env node
import { createReadStream, mkdirSync } from "node:fs";
import { basename } from "node:path";
import { StringDecoder } from "node:string_decoder";
import type { Writable } from "node:stream";

import { Dump } from "../dump.js";
import { extractExtension, writer } from "../files.js";
import type { Json } from "../json.js";
import { dump2revdocs } from "./dump2revdocs.js";
import { inflate } from "./inflate.js";
import { normalize } from "./normalize.js";
import { loadSchema, validate } from "./validate.js";

interface Arguments {
  inputs: string[];
  threads?: number;
  output?: string;
  compress?: string;
  schema?: string;
  verbose: boolean;
  debug: boolean;
  help: boolean;
}

const USAGE = `Usage:
    mwxml <subcommand> [options] [<input-file>...]

Subcommands:
    dump2revdocs     Converts MediaWiki XML dumps to page-partitioned sequences
                     of revision JSON documents.
    inflate          Converts a stream of flat revision document JSON blobs into
                     hierarchical revision document JSON blobs.
    normalize        Converts a stream of revision document JSON blobs that
                     validated against past schemas into JSON blobs that will
                     validate against the latest schema.
    validate         Validates a stream of JSON revision documents against a
                     JSON schema and writes them to stdout if they validate --
                     otherwise, complains noisily.

Options:
    -h|--help           Print this documentation
    <input-file>        The path to an input file [default: <stdin>]
    --threads=<num>     Accepted for compatibility; inputs are processed
                        sequentially in the order given
    --output=<path>     Write output to a directory with one output file per
                        input path.  [default: <stdout>]
    --compress=<type>   If set, output written to the output-dir will be
                        compressed in this format ('gz' or 'none').
                        [default: none]
    --schema=<path>     (validate) The path to a schema to apply.
    --verbose           Print progress information to stderr.
    --debug             Print debug logs.
`;

function parseArguments(argv: string[]): Arguments {
  const args: Arguments = {
    inputs: [],
    verbose: false,
    debug: false,
    help: false,
  };
  for (const arg of argv) {
    if (arg === "-h" || arg === "--help") {
      args.help = true;
    } else if (arg === "--verbose") {
      args.verbose = true;
    } else if (arg === "--debug") {
      args.debug = true;
    } else if (arg.startsWith("--threads=")) {
      const value = Number(arg.slice("--threads=".length));
      if (!Number.isInteger(value) || value < 1) {
        throw new Error(`--threads expects a positive integer, got ${arg}`);
      }
      args.threads = value;
    } else if (arg.startsWith("--output=")) {
      args.output = arg.slice("--output=".length);
    } else if (arg.startsWith("--compress=")) {
      const value = arg.slice("--compress=".length);
      if (value !== "gz" && value !== "none") {
        throw new Error(
          `--compress only supports 'gz' and 'none' (bzip2 compression ` +
            `is not supported on Node), got '${value}'`,
        );
      }
      args.compress = value;
    } else if (arg.startsWith("--schema=")) {
      args.schema = arg.slice("--schema=".length);
    } else if (arg.startsWith("-")) {
      throw new Error(`Unrecognized argument: ${arg}`);
    } else {
      args.inputs.push(arg);
    }
  }
  return args;
}

/**
 * Yields the lines of a stream (or file path) as strings.
 */
async function *readLines(
  input: string | NodeJS.ReadableStream,
): AsyncGenerator<string, void, void> {
  const stream = typeof input === "string" ? createReadStream(input) : input;
  const decoder = new StringDecoder("utf8");
  let buffer = "";
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    buffer += typeof chunk === "string" ? chunk : decoder.write(chunk);
    let index: number;
    while ((index = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      if (line.trim().length > 0) yield line;
    }
  }
  buffer += decoder.end();
  if (buffer.trim().length > 0) yield buffer;
}

/**
 * Yields the JSON documents of a stream (or file path) of newline-delimited
 * JSON.
 */
async function *readJsonLines(
  input: string | NodeJS.ReadableStream,
): AsyncGenerator<{ [key: string]: Json }, void, void> {
  for await (const line of readLines(input)) {
    yield JSON.parse(line) as { [key: string]: Json };
  }
}

function openOutput(args: Arguments, input: string): Writable {
  if (args.output === undefined) {
    return process.stdout;
  }
  mkdirSync(args.output, { recursive: true });
  const [filename] = extractExtension(basename(input));
  const extension = args.compress === "gz" ? ".gz" : "";
  const path = `${args.output}/${filename}${extension}`;
  return writer(path);
}

async function writeAll(
  docs: AsyncIterable<Json>,
  output: Writable,
): Promise<void> {
  const write = (chunk: string) =>
    new Promise<void>((resolve, reject) => {
      output.write(chunk, (error) =>
        error === null || error === undefined ? resolve() : reject(error),
      );
    });

  for await (const doc of docs) {
    await write(`${JSON.stringify(doc)}\n`);
  }

  if (output !== process.stdout) {
    await new Promise<void>((resolve, reject) => {
      output.end((error?: Error | null) =>
        error ? reject(error) : resolve(),
      );
    });
  }
}

async function runDump2revdocs(args: Arguments): Promise<void> {
  const inputs: (string | NodeJS.ReadableStream)[] =
    args.inputs.length > 0 ? args.inputs : [process.stdin];
  for (const input of inputs) {
    const dump = await Dump.fromFile(input);
    const output = openOutput(args, typeof input === "string" ? input : "<stdin>");
    await writeAll(dump2revdocs(dump, args.verbose), output);
  }
}

async function runJsonLines(
  args: Arguments,
  processDocs: (
    docs: AsyncGenerator<{ [key: string]: Json }>,
  ) => AsyncGenerator<{ [key: string]: Json }>,
): Promise<void> {
  const inputs: (string | NodeJS.ReadableStream)[] =
    args.inputs.length > 0 ? args.inputs : [process.stdin];
  for (const input of inputs) {
    const output = openOutput(args, typeof input === "string" ? input : "<stdin>");
    await writeAll(processDocs(readJsonLines(input)), output);
  }
}

async function main(argv: string[]): Promise<number> {
  const [subcommand, ...rest] = argv;
  if (subcommand === undefined || subcommand === "-h" ||
      subcommand === "--help") {
    process.stdout.write(USAGE);
    return 0;
  }

  const args = parseArguments(rest);
  if (args.help) {
    process.stdout.write(USAGE);
    return 0;
  }

  if (args.output !== undefined && args.inputs.length === 0) {
    throw new Error(
      "--output requires explicit <input-file> paths (stdin has no name).",
    );
  }

  switch (subcommand) {
    case "dump2revdocs":
      await runDump2revdocs(args);
      return 0;
    case "inflate":
      await runJsonLines(args, inflate);
      return 0;
    case "normalize":
      await runJsonLines(args, (docs) => normalize(docs, args.verbose));
      return 0;
    case "validate":
      if (args.schema === undefined) {
        throw new Error("validate requires --schema=<path>.");
      }
      {
        const schema = await loadSchema(args.schema);
        await runJsonLines(args, (docs) => validate(docs, schema));
      }
      return 0;
    default:
      process.stderr.write(`Unknown subcommand: ${subcommand}\n\n`);
      process.stderr.write(USAGE);
      return 1;
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  },
);
