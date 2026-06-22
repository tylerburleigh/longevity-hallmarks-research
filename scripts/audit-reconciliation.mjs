#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { buildParallelReconciliation, outputPath, workspaceRoot } from "./reconcile-parallel-outputs.mjs";

const ignoredGeneratedValue = "<generated_at>";

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

function normalizeReport(value) {
  return {
    ...value,
    generated_at: ignoredGeneratedValue
  };
}

function sectionDiffs(actual, expected) {
  const keys = [...new Set([...Object.keys(actual), ...Object.keys(expected)])].sort((left, right) => left.localeCompare(right));
  return keys.filter((key) => key !== "generated_at" && stableJson(actual[key]) !== stableJson(expected[key]));
}

async function main() {
  const filePath = path.join(workspaceRoot, outputPath);
  if (!(await exists(filePath))) {
    console.error(`Parallel-reconciliation audit failed: missing ${outputPath}.`);
    console.error("Run npm run reconcile:parallel.");
    process.exit(1);
  }

  const actual = await readJson(outputPath);
  if (Number.isNaN(new Date(actual.generated_at).getTime())) {
    console.error(`Parallel-reconciliation audit failed: ${outputPath} has invalid generated_at.`);
    process.exit(1);
  }

  const expected = await buildParallelReconciliation();
  const normalizedActual = normalizeReport(actual);
  const normalizedExpected = normalizeReport(expected);

  if (stableJson(normalizedActual) !== stableJson(normalizedExpected)) {
    const diffs = sectionDiffs(normalizedActual, normalizedExpected);
    console.error(`Parallel-reconciliation audit failed: ${outputPath} is stale or inconsistent with canonical records and orchestration state.`);
    if (diffs.length > 0) {
      console.error(`Changed top-level section(s): ${diffs.join(", ")}.`);
    }
    console.error("Run npm run reconcile:parallel and review the generated diff.");
    process.exit(1);
  }

  console.log(`Parallel-reconciliation audit passed for ${actual.open_findings.length} open finding(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
