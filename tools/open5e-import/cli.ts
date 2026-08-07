#!/usr/bin/env node

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  importOpen5eS0,
  importOpen5eS1,
  importOpen5eS2,
  importOpen5eS3,
  importOpen5eS4,
  importOpen5eS5,
  importOpen5eS6,
  importOpen5eS7,
  type Open5eImportOptions,
} from "../../src/content/open5e-import.js";
import { importOpen5eS8, type Open5eCorpusImportOptions } from "../../src/content/open5e-corpus-import.js";
import type { Open5ePackManifest } from "../../src/content/schema.js";

interface CliOptions {
  outputRoot: string;
  packVersion: string;
  sourceFetchedAt: string;
  targetDocumentKey: string;
  taxonomyDocumentKey: string;
  targetV1DocumentSlug: string;
  apiBaseUrl: string;
  apiV1BaseUrl: string;
  pageSize: number;
  maxAttempts: number;
  overwrite: boolean;
  basePackDirectory?: string;
  slice: "s0" | "s1" | "s2" | "s3" | "s4" | "s5" | "s6" | "s7" | "s8";
}

async function main(): Promise<void> {
  const [command = "help", ...argumentsList] = process.argv.slice(2);
  if (
    command === "help"
    || command === "--help"
    || command === "-h"
    || argumentsList.includes("--help")
    || argumentsList.includes("-h")
  ) {
    printHelp();
    return;
  }

  const options = parseOptions(argumentsList);
  const importer = options.slice === "s0"
    ? importOpen5eS0
    : options.slice === "s1"
      ? importOpen5eS1
      : options.slice === "s2"
      ? importOpen5eS2
        : options.slice === "s3"
          ? importOpen5eS3
          : options.slice === "s4"
            ? importOpen5eS4
            : options.slice === "s5"
              ? importOpen5eS5
              : options.slice === "s6"
                ? importOpen5eS6
                : options.slice === "s7"
                  ? importOpen5eS7
                  : importOpen5eS8;
  if (command === "import") {
    const result = await importer(options);
    printJson({
      status: "imported",
      slice: options.slice,
      packDirectory: result.packDirectory,
      packVersion: result.manifest.packVersion,
      packHash: result.manifest.packHash,
      collections: collectionCounts(result.manifest),
    });
    return;
  }

  if (command === "verify-determinism") {
    const verificationRoot = options.outputRootExplicit
      ? options.outputRoot
      : await mkdtemp(join(tmpdir(), `lantern-open5e-${options.slice}-`));
    const first = await importer({
      ...options,
      outputRoot: join(verificationRoot, "run-a"),
      overwrite: false,
    });
    const second = await importer({
      ...options,
      outputRoot: join(verificationRoot, "run-b"),
      overwrite: false,
    });
    if (first.manifest.packHash !== second.manifest.packHash) {
      throw new Error(
        `Determinism failure: ${first.manifest.packHash} != ${second.manifest.packHash}`
      );
    }
    printJson({
      status: "deterministic",
      slice: options.slice,
      verificationRoot,
      packVersion: first.manifest.packVersion,
      firstPackDirectory: first.packDirectory,
      secondPackDirectory: second.packDirectory,
      firstPackHash: first.manifest.packHash,
      secondPackHash: second.manifest.packHash,
      identical: true,
      collections: collectionCounts(first.manifest),
    });
    return;
  }

  throw new Error(`Unknown Open5e importer command: ${command}`);
}

function parseOptions(argumentsList: string[]): CliOptions & Open5eImportOptions & Open5eCorpusImportOptions & { outputRootExplicit: boolean } {
  const values = new Map<string, string>();
  let overwrite = false;
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index] as string;
    if (argument === "--overwrite") {
      overwrite = true;
      continue;
    }
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected Open5e importer argument: ${argument}`);
    }
    const equalsIndex = argument.indexOf("=");
    if (equalsIndex >= 0) {
      values.set(argument.slice(2, equalsIndex), argument.slice(equalsIndex + 1));
      continue;
    }
    const next = argumentsList[index + 1];
    if (!next || next.startsWith("--")) {
      throw new Error(`Open5e importer option ${argument} needs a value.`);
    }
    values.set(argument.slice(2), next);
    index += 1;
  }

  const knownOptions = new Set([
    "output-root",
    "pack-version",
    "source-fetched-at",
    "target-document",
    "taxonomy-document",
    "target-v1-document-slug",
    "api-base-url",
    "api-v1-base-url",
    "page-size",
    "max-attempts",
    "slice",
    "base-pack",
  ]);
  for (const key of values.keys()) {
    if (!knownOptions.has(key)) {
      throw new Error(`Unknown Open5e importer option: --${key}`);
    }
  }

  const sourceFetchedAt = values.get("source-fetched-at")
    ?? sourceTimestampFromEnvironment()
    ?? "";
  if (!sourceFetchedAt) {
    throw new Error(
      "A reproducible source timestamp is required. Pass --source-fetched-at or set OPEN5E_SOURCE_FETCHED_AT/SOURCE_DATE_EPOCH."
    );
  }

  const outputRootValue = values.get("output-root");
  const slice = parseSlice(values.get("slice") ?? "s1");
  return {
    outputRoot: resolve(outputRootValue ?? "content/open5e"),
    outputRootExplicit: outputRootValue !== undefined,
    packVersion: values.get("pack-version") ?? (slice === "s8" ? "open5e-v2-full-corpus-s8" : `open5e-v2-srd-2014-${slice}`),
    sourceFetchedAt,
    targetDocumentKey: values.get("target-document") ?? "srd-2014",
    taxonomyDocumentKey: values.get("taxonomy-document") ?? "core",
    targetV1DocumentSlug: values.get("target-v1-document-slug") ?? "wotc-srd",
    apiBaseUrl: values.get("api-base-url") ?? "https://api.open5e.com/v2",
    apiV1BaseUrl: values.get("api-v1-base-url") ?? "https://api.open5e.com/v1",
    pageSize: parseIntegerOption(values.get("page-size"), 100, "page-size"),
    maxAttempts: parseIntegerOption(values.get("max-attempts"), 4, "max-attempts"),
    overwrite,
    basePackDirectory: values.get("base-pack") ? resolve(values.get("base-pack") as string) : undefined,
    slice,
  };
}

function parseSlice(value: string): "s0" | "s1" | "s2" | "s3" | "s4" | "s5" | "s6" | "s7" | "s8" {
  if (value === "s0" || value === "s1" || value === "s2" || value === "s3" || value === "s4" || value === "s5" || value === "s6" || value === "s7" || value === "s8") return value;
  throw new Error("--slice must be s0, s1, s2, s3, s4, s5, s6, s7, or s8.");
}

function sourceTimestampFromEnvironment(): string | undefined {
  const explicit = process.env.OPEN5E_SOURCE_FETCHED_AT?.trim();
  if (explicit) return explicit;
  const epoch = process.env.SOURCE_DATE_EPOCH?.trim();
  if (!epoch) return undefined;
  const seconds = Number(epoch);
  if (!Number.isFinite(seconds)) {
    throw new Error("SOURCE_DATE_EPOCH must be a finite number of seconds since Unix epoch.");
  }
  return new Date(seconds * 1_000).toISOString();
}

function parseIntegerOption(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`--${name} must be an integer.`);
  }
  return parsed;
}

function collectionCounts(manifest: Open5ePackManifest): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(manifest.collections).map(([collection, value]) => [collection, {
      raw: value.raw.recordCount,
      normalized: value.normalized.recordCount,
      compiled: value.compiled.recordCount,
    }])
  );
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printHelp(): void {
  process.stdout.write([
    "Lantern Open5e deterministic importer",
    "",
    "Commands:",
    "  import                Fetch and build one versioned pack.",
    "  verify-determinism    Fetch and build twice, then compare pack hashes.",
    "",
    "Required reproducibility input:",
    "  --source-fetched-at <ISO timestamp>",
    "",
    "Options:",
    "  --output-root <path>          Parent directory for the versioned pack.",
    "  --slice <s0|s1|s2|s3|s4|s5|s6|s7|s8> Default: s1",
    "  --pack-version <version>      S8 default: open5e-v2-full-corpus-s8",
    "  --base-pack <path>             Reviewed S7 pack carried into S8",
    "  --target-document <key>       Default: srd-2014",
    "  --taxonomy-document <key>     Default: core",
    "  --target-v1-document-slug     Default: wotc-srd",
    "  --api-base-url <url>          Default: https://api.open5e.com/v2",
    "  --api-v1-base-url <url>       Default: https://api.open5e.com/v1",
    "  --page-size <number>          Default: 100",
    "  --max-attempts <number>       Default: 4",
    "  --overwrite                   Replace known generated files in an existing pack.",
    "",
  ].join("\n"));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Open5e import failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
