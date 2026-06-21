#!/usr/bin/env node

import {
  buildClinicalTrialsSnapshot,
  parseArgs,
  toPrettyJson,
  writeJson
} from "./lib/source-snapshots.mjs";

function usage() {
  console.error("Usage: npm run ingest:clinicaltrials -- --nct <NCTID> [--source-id nct-########] [--date YYYY-MM-DD] [--retrieved-at ISO] [--output path] [--write]");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const nctId = args.nct ?? args._[0];
  if (!nctId) {
    usage();
    process.exit(1);
  }

  const { snapshot, outputPath } = await buildClinicalTrialsSnapshot({
    nctId,
    sourceId: args.source_id,
    date: args.date,
    retrievedAt: args.retrieved_at
  });
  const targetPath = args.output ?? outputPath;

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

