#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { buildParallelBatchPlan, outputPath, workspaceRoot } from "./plan-parallel-codex-batches.mjs";

const ignoredGeneratedAt = "<generated_at>";

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(workspaceRoot, relativePath), "utf8"));
}

function stableJson(value) {
  return JSON.stringify(value, null, 2);
}

function normalizePlan(value) {
  return {
    ...value,
    generated_at: ignoredGeneratedAt
  };
}

function sectionDiffs(actual, expected) {
  const keys = [...new Set([...Object.keys(actual), ...Object.keys(expected)])].sort((left, right) => left.localeCompare(right));
  return keys.filter((key) => key !== "generated_at" && stableJson(actual[key]) !== stableJson(expected[key]));
}

async function main() {
  if (!(await exists(path.join(workspaceRoot, outputPath)))) {
    console.error(`Parallel-batch audit failed: missing ${outputPath}.`);
    console.error("Run npm run jobs:plan-parallel.");
    process.exit(1);
  }

  const actual = await readJson(outputPath);
  if (Number.isNaN(new Date(actual.generated_at).getTime())) {
    console.error(`Parallel-batch audit failed: ${outputPath} has invalid generated_at.`);
    process.exit(1);
  }

  const expected = await buildParallelBatchPlan({
    maxWorkers: actual.scheduler_policy?.max_workers_per_batch
  });
  const normalizedActual = normalizePlan(actual);
  const normalizedExpected = normalizePlan(expected);

  if (stableJson(normalizedActual) !== stableJson(normalizedExpected)) {
    const diffs = sectionDiffs(normalizedActual, normalizedExpected);
    console.error(`Parallel-batch audit failed: ${outputPath} is stale or inconsistent with live Codex jobs.`);
    if (diffs.length > 0) {
      console.error(`Changed top-level section(s): ${diffs.join(", ")}.`);
    }
    console.error("Run npm run jobs:plan-parallel and review the generated diff.");
    process.exit(1);
  }

  console.log(`Parallel-batch audit passed for ${actual.batches.length} batch(es).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
