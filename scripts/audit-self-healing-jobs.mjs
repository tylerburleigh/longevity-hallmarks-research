#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  buildSelfHealingJobs,
  generatedJobPath,
  generatedJobRoot,
  stringifyJob,
  workspaceRoot
} from "./generate-self-healing-jobs.mjs";

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function toPosixRelative(filePath) {
  return path.relative(workspaceRoot, filePath).split(path.sep).join("/");
}

async function walkJsonFiles(rootPath) {
  if (!(await exists(rootPath))) {
    return [];
  }

  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkJsonFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(entryPath);
    }
  }

  return files.sort((left, right) => toPosixRelative(left).localeCompare(toPosixRelative(right)));
}

async function main() {
  const issues = [];
  const expectedJobs = await buildSelfHealingJobs({ limit: Number.POSITIVE_INFINITY });
  const expectedByPath = new Map(expectedJobs.map((job) => [generatedJobPath(job), stringifyJob(job)]));
  const generatedFiles = await walkJsonFiles(path.join(workspaceRoot, generatedJobRoot));
  const generatedPaths = new Set(generatedFiles.map(toPosixRelative));

  for (const expectedPath of expectedByPath.keys()) {
    if (!generatedPaths.has(expectedPath)) {
      issues.push(`${expectedPath}: expected generated self-healing job is missing; rerun npm run jobs:self-healing -- --replace.`);
    }
  }

  for (const filePath of generatedFiles) {
    const relativePath = toPosixRelative(filePath);
    const expected = expectedByPath.get(relativePath);
    if (!expected) {
      issues.push(`${relativePath}: generated self-healing job no longer maps to current triage-state recommended jobs.`);
      continue;
    }

    const actual = await fs.readFile(filePath, "utf8");
    if (actual !== expected) {
      issues.push(`${relativePath}: generated self-healing job is stale; rerun npm run jobs:self-healing -- --replace.`);
    }
  }

  if (issues.length > 0) {
    console.error(`Self-healing job audit failed with ${issues.length} issue(s):`);
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log(`Self-healing job audit passed for ${generatedFiles.length} generated live job(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
