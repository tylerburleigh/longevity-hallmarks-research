#!/usr/bin/env node

import { diffSnapshot, parseArgs, readJson, toPrettyJson } from "./lib/source-snapshots.mjs";

function usage() {
  console.error("Usage: npm run diff:source-snapshot -- <snapshot.json> [...snapshot.json] [--json] [--no-fail]");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const paths = args._;
  if (paths.length === 0) {
    usage();
    process.exit(1);
  }

  const diffs = [];
  for (const snapshotPath of paths) {
    const snapshot = await readJson(snapshotPath);
    diffs.push({ path: snapshotPath, ...(await diffSnapshot(snapshot)) });
  }

  if (args.json) {
    console.log(toPrettyJson(diffs));
  } else {
    for (const diff of diffs) {
      const status = diff.unchanged ? "UNCHANGED" : "CHANGED";
      console.log(`${status} ${diff.path}`);
      if (!diff.unchanged) {
        console.log(`  recorded sha256: ${diff.content_sha256_recorded}`);
        console.log(`  current  sha256: ${diff.content_sha256_current}`);
        console.log(`  recorded type:   ${diff.content_type_recorded}`);
        console.log(`  current  type:   ${diff.content_type_current}`);
      }
    }
  }

  if (!args.no_fail && diffs.some((diff) => !diff.unchanged)) {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

