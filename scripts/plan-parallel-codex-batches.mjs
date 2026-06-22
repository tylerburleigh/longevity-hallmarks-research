#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const workspaceRoot = process.cwd();
export const liveJobRoot = "ops/codex-jobs/live";
export const outputPath = "ops/codex-batches/parallel-batch-plan.v1.json";
export const plannerVersion = "1.0.0";
export const defaultMaxWorkers = 4;

const schedulableStatuses = new Set(["planned", "ready"]);
const runningStatuses = new Set(["running"]);
const costRank = new Map([
  ["low", 0],
  ["medium", 1],
  ["high", 2]
]);
const ioRank = new Map([
  ["low", 0],
  ["medium", 1],
  ["high", 2]
]);

function usage() {
  console.error(`Usage: npm run jobs:plan-parallel -- [--max-workers <n>] [--output <path>] [--dry-run]`);
}

function parsePositiveInteger(value, flagName) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${flagName} must be a positive integer.`);
  }
  return number;
}

function parseArgs(argv) {
  const options = {
    maxWorkers: defaultMaxWorkers,
    output: outputPath,
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--max-workers") {
      options.maxWorkers = parsePositiveInteger(argv[++index], "--max-workers");
    } else if (arg === "--output") {
      options.output = argv[++index];
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

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

function sortStrings(values) {
  return [...new Set((values ?? []).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function intersect(left, right) {
  const rightSet = new Set(right ?? []);
  return sortStrings((left ?? []).filter((value) => rightSet.has(value)));
}

function rankValue(rankMap, value) {
  return rankMap.get(value) ?? -1;
}

function maxRankValue(rankMap, values, fallback = "low") {
  return [...values].sort((left, right) => rankValue(rankMap, right) - rankValue(rankMap, left))[0] ?? fallback;
}

function summarizeCost(jobs) {
  const costs = jobs.map((job) => job.record.orchestration?.expected_cost ?? {});
  return {
    cost_class: maxRankValue(costRank, costs.map((cost) => cost.cost_class)),
    expected_wall_time_ms: Math.max(0, ...costs.map((cost) => cost.expected_wall_time_ms ?? 0)),
    expected_token_budget: costs.reduce((sum, cost) => sum + (cost.expected_token_budget ?? 0), 0),
    io_intensity: maxRankValue(ioRank, costs.map((cost) => cost.io_intensity))
  };
}

function commandForJob(job) {
  return ["npm", "run", "agent:codex:worktree", "--", "--job-file", job.path, "--execute"];
}

function batchKeys(batch, field) {
  return sortStrings(batch.jobs.flatMap((job) => job.record.orchestration?.[field] ?? []));
}

function overlappingExecutionKeys(job, batch) {
  const orchestration = job.record.orchestration ?? {};
  const batchReadSets = batchKeys(batch, "read_sets");
  const batchWriteSets = batchKeys(batch, "write_sets");
  const batchConflictKeys = batchKeys(batch, "conflict_keys");

  return sortStrings([
    ...intersect(orchestration.conflict_keys, batchConflictKeys),
    ...intersect(orchestration.write_sets, batchWriteSets),
    ...intersect(orchestration.write_sets, batchReadSets),
    ...intersect(orchestration.read_sets, batchWriteSets)
  ]);
}

function canShareBatch(job, batch, maxWorkers) {
  if (batch.jobs.length >= maxWorkers) {
    return false;
  }
  if (job.record.orchestration?.parallel_group !== batch.parallelGroup) {
    return false;
  }

  const overlaps = overlappingExecutionKeys(job, batch);
  if (overlaps.length === 0) {
    return true;
  }

  return Boolean(job.record.orchestration?.reconciliation_required && batch.jobs.every((batchJob) => batchJob.record.orchestration?.reconciliation_required));
}

function addJobToBatch(job, batch) {
  const overlaps = overlappingExecutionKeys(job, batch);
  batch.jobs.push(job);
  batch.overlappingExecutionKeys = sortStrings([...(batch.overlappingExecutionKeys ?? []), ...overlaps]);
}

function materializeBatch(batch, sequence) {
  const jobs = batch.jobs.toSorted((left, right) => left.record.id.localeCompare(right.record.id));
  const overlappingExecutionKeys = sortStrings(batch.overlappingExecutionKeys);

  return {
    batch_id: `parallel-batch-${String(sequence).padStart(3, "0")}-${batch.parallelGroup}`,
    sequence,
    parallel_group: batch.parallelGroup,
    execution_class: overlappingExecutionKeys.length > 0 ? "reconciliation_required" : "independent",
    reconciliation_required: Boolean(overlappingExecutionKeys.length > 0 || jobs.some((job) => job.record.orchestration?.reconciliation_required)),
    job_ids: jobs.map((job) => job.record.id),
    job_paths: jobs.map((job) => job.path),
    agent_roles: sortStrings(jobs.map((job) => job.record.agent_role)),
    modes: sortStrings(jobs.map((job) => job.record.mode)),
    read_sets: batchKeys({ jobs }, "read_sets"),
    write_sets: batchKeys({ jobs }, "write_sets"),
    conflict_keys: batchKeys({ jobs }, "conflict_keys"),
    overlapping_execution_keys: overlappingExecutionKeys,
    expected_cost: summarizeCost(jobs),
    commands: jobs.map(commandForJob)
  };
}

function sortJobs(jobs) {
  return jobs.toSorted((left, right) => {
    const group = left.record.orchestration.parallel_group.localeCompare(right.record.orchestration.parallel_group);
    return group || left.record.id.localeCompare(right.record.id);
  });
}

async function loadLiveJobs() {
  const files = await walkJsonFiles(path.join(workspaceRoot, liveJobRoot));
  const jobs = [];

  for (const filePath of files) {
    const path = toPosixRelative(filePath);
    const record = JSON.parse(await fs.readFile(filePath, "utf8"));
    if (record.record_type === "codex_job") {
      jobs.push({ record, path });
    }
  }

  return jobs.toSorted((left, right) => left.path.localeCompare(right.path));
}

function deferredJob(job, reason, details) {
  return {
    job_id: job.record.id,
    job_path: job.path,
    reason,
    details
  };
}

function groupIntoBatches(schedulableJobs, maxWorkers) {
  const batches = [];

  for (const job of sortJobs(schedulableJobs)) {
    let assigned = false;
    for (const batch of batches) {
      if (canShareBatch(job, batch, maxWorkers)) {
        addJobToBatch(job, batch);
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      batches.push({
        parallelGroup: job.record.orchestration.parallel_group,
        jobs: [job],
        overlappingExecutionKeys: []
      });
    }
  }

  return batches.map((batch, index) => materializeBatch(batch, index + 1));
}

export function buildParallelBatchPlanFromJobs({
  liveJobs,
  generatedAt = new Date().toISOString(),
  maxWorkers = defaultMaxWorkers,
  sourceJobRoot = liveJobRoot
} = {}) {
  const schedulableJobs = [];
  const deferredJobs = [];

  for (const job of liveJobs) {
    if (runningStatuses.has(job.record.lifecycle_status)) {
      deferredJobs.push(deferredJob(job, "already_running", "Running jobs are excluded from new batch starts."));
      continue;
    }

    if (!schedulableStatuses.has(job.record.lifecycle_status)) {
      deferredJobs.push(deferredJob(job, "unsupported_status", `Job status ${job.record.lifecycle_status} is not schedulable.`));
      continue;
    }

    if (!job.record.orchestration?.parallel_group) {
      deferredJobs.push(deferredJob(job, "missing_orchestration", "Job lacks orchestration.parallel_group."));
      continue;
    }

    schedulableJobs.push(job);
  }

  const batches = groupIntoBatches(schedulableJobs, maxWorkers);
  const estimatedWallTimeMs = batches.reduce((sum, batch) => sum + batch.expected_cost.expected_wall_time_ms, 0);
  const estimatedTokenBudget = batches.reduce((sum, batch) => sum + batch.expected_cost.expected_token_budget, 0);

  return {
    schema_version: "1.0.0",
    record_type: "parallel_batch_plan",
    id: "parallel-batch-plan-v1",
    generated_at: generatedAt,
    source_job_root: sourceJobRoot,
    planner_version: plannerVersion,
    scheduler_policy: {
      max_workers_per_batch: maxWorkers,
      schedulable_statuses: [...schedulableStatuses].sort(),
      running_status_policy: "defer",
      conflict_policy: "same_group_no_overlap_or_reconciliation"
    },
    summary: {
      live_job_count: liveJobs.length,
      schedulable_job_count: schedulableJobs.length,
      deferred_job_count: deferredJobs.length,
      batch_count: batches.length,
      max_batch_width: Math.max(0, ...batches.map((batch) => batch.job_ids.length)),
      independent_batch_count: batches.filter((batch) => batch.execution_class === "independent").length,
      reconciliation_batch_count: batches.filter((batch) => batch.execution_class === "reconciliation_required").length,
      estimated_wall_time_ms: estimatedWallTimeMs,
      estimated_token_budget: estimatedTokenBudget
    },
    batches,
    deferred_jobs: deferredJobs.toSorted((left, right) => left.job_id.localeCompare(right.job_id))
  };
}

export async function buildParallelBatchPlan({ generatedAt = new Date().toISOString(), maxWorkers = defaultMaxWorkers } = {}) {
  const liveJobs = await loadLiveJobs();
  return buildParallelBatchPlanFromJobs({
    liveJobs,
    generatedAt,
    maxWorkers,
    sourceJobRoot: liveJobRoot
  });
}

async function writeJson(relativePath, value) {
  const filePath = path.join(workspaceRoot, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const plan = await buildParallelBatchPlan({ maxWorkers: options.maxWorkers });

  if (options.dryRun) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  await writeJson(options.output, plan);
  console.log(`Wrote ${options.output}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
