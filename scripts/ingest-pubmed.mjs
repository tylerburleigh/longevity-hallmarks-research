#!/usr/bin/env node

import {
  buildPubmedSnapshot,
  parseArgs,
  toPrettyJson,
  writeJson
} from "./lib/source-snapshots.mjs";

function usage() {
  console.error("Usage: npm run ingest:pubmed -- --pmid <PMID> [--source-id pmid-<PMID>] [--date YYYY-MM-DD] [--retrieved-at ISO] [--output path] [--write]");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pmid = args.pmid ?? args._[0];
  if (!pmid) {
    usage();
    process.exit(1);
  }

  const { snapshot, outputPath } = await buildPubmedSnapshot({
    pmid,
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

