#!/usr/bin/env node

import {
  buildSnapshotFromExisting,
  parseArgs,
  readJson,
  toPrettyJson,
  writeJson
} from "./lib/source-snapshots.mjs";

function usage() {
  console.error("Usage: npm run refresh:source-snapshot -- <snapshot.json> [--in-place | --output path] [--date YYYY-MM-DD] [--retrieved-at ISO] [--write]");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const snapshotPath = args._[0];
  if (!snapshotPath) {
    usage();
    process.exit(1);
  }

  const existing = await readJson(snapshotPath);
  const { snapshot, outputPath } = await buildSnapshotFromExisting(existing, {
    date: args.date,
    retrievedAt: args.retrieved_at
  });
  const targetPath = args.in_place ? snapshotPath : args.output ?? outputPath;

  if (args.write) {
    await writeJson(targetPath, snapshot);
    console.log(`Wrote ${targetPath}`);
  } else {
    console.log(toPrettyJson({ outputPath: targetPath, snapshot }));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

