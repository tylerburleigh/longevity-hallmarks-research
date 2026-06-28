#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  buildOrchestrationMetrics,
  outputPath,
  workspaceRoot
} from "./export-orchestration-metrics.mjs";

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

function normalizeMetrics(value) {
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
    console.error(`Orchestration-metrics audit failed: missing ${outputPath}.`);
    console.error("Run npm run metrics:orchestration.");
    process.exit(1);
  }

  const actual = await readJson(outputPath);
  const triageState = await readJson(actual.metric_policy?.triage_state_path ?? "ops/triage-state.v1.json");
  if (Number.isNaN(new Date(actual.generated_at).getTime())) {
    console.error(`Orchestration-metrics audit failed: ${outputPath} has invalid generated_at.`);
    process.exit(1);
  }

  const expected = await buildOrchestrationMetrics();
  const normalizedActual = normalizeMetrics(actual);
  const normalizedExpected = normalizeMetrics(expected);

  if (stableJson(normalizedActual) !== stableJson(normalizedExpected)) {
    const diffs = sectionDiffs(normalizedActual, normalizedExpected);
    console.error(`Orchestration-metrics audit failed: ${outputPath} is stale or inconsistent with orchestration state.`);
    if (diffs.length > 0) {
      console.error(`Changed top-level section(s): ${diffs.join(", ")}.`);
    }
    console.error("Run npm run metrics:orchestration and review the generated diff.");
    process.exit(1);
  }

  const issues = [];
  if (actual.summary?.conflict_finding_count === 0 && actual.summary?.conflict_rate !== 0) {
    issues.push("summary.conflict_rate must be 0 when summary.conflict_finding_count is 0.");
  }
  if (actual.quality_pressure?.conflicts?.open_finding_count === 0 && actual.quality_pressure?.conflicts?.conflict_rate !== 0) {
    issues.push("quality_pressure.conflicts.conflict_rate must be 0 when open_finding_count is 0.");
  }
  if (
    actual.quality_pressure?.worker_failures?.partial_or_failed_agent_run_count !==
    triageState.summary?.partial_or_failed_agent_run_count
  ) {
    issues.push("quality_pressure.worker_failures.partial_or_failed_agent_run_count must match triage summary.partial_or_failed_agent_run_count.");
  }
  if (issues.length > 0) {
    console.error(`Orchestration-metrics audit failed with ${issues.length} semantic issue(s):`);
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log(`Orchestration-metrics audit passed for ${actual.summary.planned_parallel_batch_count} planned batch(es).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
