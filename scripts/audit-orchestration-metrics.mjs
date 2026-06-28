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

async function existsPath(relativePath) {
  try {
    await fs.access(path.join(workspaceRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function walkJsonFiles(relativeRoot) {
  const rootPath = path.join(workspaceRoot, relativeRoot);
  if (!(await existsPath(relativeRoot))) {
    return [];
  }

  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.join(relativeRoot, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkJsonFiles(relativePath)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(relativePath.split(path.sep).join("/"));
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

async function recordIdsUnder(relativeRoot, recordType) {
  const ids = [];
  for (const filePath of await walkJsonFiles(relativeRoot)) {
    const record = await readJson(filePath);
    if (record.record_type === recordType && record.id) {
      ids.push(record.id);
    }
  }
  return ids;
}

function latestWorkerStatesByJob(batchRunEntries) {
  const latestWorkersByJob = new Map();
  for (const { record, path: runPath } of batchRunEntries) {
    for (const [workerIndex, worker] of (record.worker_states ?? []).entries()) {
      if (!worker.job_id) {
        continue;
      }

      const sortKey = [
        worker.completed_at ?? record.completed_at ?? worker.started_at ?? record.started_at ?? "",
        record.started_at ?? "",
        runPath,
        String(workerIndex).padStart(6, "0")
      ].join("\u0000");
      const current = latestWorkersByJob.get(worker.job_id);
      if (!current || sortKey > current.sortKey) {
        latestWorkersByJob.set(worker.job_id, { worker, sortKey });
      }
    }
  }
  return [...latestWorkersByJob.values()].map((entry) => entry.worker);
}

async function actionableFailedWorkerCount(actual) {
  const liveJobIds = new Set(await recordIdsUnder(actual.metric_policy?.live_job_root ?? "ops/codex-jobs/live", "codex_job"));
  const batchRunRoot = actual.metric_policy?.batch_run_root ?? "ops/codex-batches/runs";
  const batchRunEntries = [];
  for (const filePath of await walkJsonFiles(batchRunRoot)) {
    const record = await readJson(filePath);
    if (record.record_type === "parallel_batch_run") {
      batchRunEntries.push({ record, path: filePath });
    }
  }
  return latestWorkerStatesByJob(batchRunEntries).filter(
    (worker) => worker.status === "failed" && liveJobIds.has(worker.job_id)
  ).length;
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
  const expectedActionableFailedWorkerCount = await actionableFailedWorkerCount(actual);
  const plannedReconciliationBatchCount = (actual.planned_parallelism?.batches ?? []).filter((batch) => batch.reconciliation_required).length;
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
  if (actual.quality_pressure?.worker_failures?.failed_worker_count !== expectedActionableFailedWorkerCount) {
    issues.push("quality_pressure.worker_failures.failed_worker_count must match latest failed live worker count.");
  }
  if (actual.summary?.actionable_failed_worker_count !== expectedActionableFailedWorkerCount) {
    issues.push("summary.actionable_failed_worker_count must match latest failed live worker count.");
  }
  if (actual.summary?.historical_failed_worker_count !== actual.summary?.failed_worker_count) {
    issues.push("summary.historical_failed_worker_count must match summary.failed_worker_count.");
  }
  if (
    actual.summary?.actionable_partial_or_failed_agent_run_count !==
    triageState.summary?.partial_or_failed_agent_run_count
  ) {
    issues.push("summary.actionable_partial_or_failed_agent_run_count must match triage summary.partial_or_failed_agent_run_count.");
  }
  if (actual.summary?.planned_reconciliation_batch_count !== plannedReconciliationBatchCount) {
    issues.push("summary.planned_reconciliation_batch_count must match planned batches with reconciliation_required=true.");
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
