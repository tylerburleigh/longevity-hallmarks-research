#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const workspaceRoot = process.cwd();
export const outputPath = "ops/codex-batches/orchestration-metrics.v1.json";
export const batchPlanPath = "ops/codex-batches/parallel-batch-plan.v1.json";
export const batchRunRoot = "ops/codex-batches/runs";
export const liveJobRoot = "ops/codex-jobs/live";
export const archiveJobRoot = "ops/codex-jobs/archive";
export const reconciliationPath = "ops/reconciliation/parallel-reconciliation.v1.json";
export const triageStatePath = "ops/triage-state.v1.json";
export const releaseReadinessPath = "ops/release-readiness.v1.json";
export const exportRoot = "exports/latest";

const canonicalRoots = ["data", "research"];
const acceptedCandidateStatuses = new Set(["accepted", "applied"]);
const acceptedRecordExcludedRecordTypes = ["candidate_change", "evidence_review", "research_session"];
const extractionDebtRecordTypes = ["finding", "outcome", "result", "source_snapshot", "text_snapshot"];

function usage() {
  console.error(`Usage: npm run metrics:orchestration -- [--output <path>] [--dry-run]`);
}

function parseArgs(argv) {
  const options = {
    output: outputPath,
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--output") {
      options.output = argv[++index];
      if (!options.output) {
        throw new Error("--output requires a value.");
      }
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

async function walkFiles(rootPath) {
  if (!(await exists(rootPath))) {
    return [];
  }

  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files.sort((left, right) => toPosixRelative(left).localeCompare(toPosixRelative(right)));
}

async function walkJsonFiles(rootPath) {
  return (await walkFiles(rootPath)).filter((filePath) => filePath.endsWith(".json"));
}

export async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(workspaceRoot, relativePath), "utf8"));
}

async function readOptionalJson(relativePath, fallback) {
  if (!(await exists(path.join(workspaceRoot, relativePath)))) {
    return fallback;
  }
  return readJson(relativePath);
}

async function writeJson(relativePath, value) {
  const filePath = path.join(workspaceRoot, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sortStrings(values) {
  return [...new Set((values ?? []).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function ratio(numerator, denominator) {
  if (!denominator) {
    return 0;
  }
  return Number((numerator / denominator).toFixed(4));
}

function durationMs(startedAt, completedAt) {
  const start = Date.parse(startedAt ?? "");
  const end = Date.parse(completedAt ?? "");
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return 0;
  }
  return end - start;
}

function countBy(values) {
  const counts = new Map();
  for (const value of values ?? []) {
    const key = String(value ?? "");
    if (!key) {
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .toSorted((left, right) => left.key.localeCompare(right.key));
}

function recordTypeEntries(entries, recordType) {
  return entries.filter((entry) => entry.record.record_type === recordType);
}

async function loadRecords(roots) {
  const files = (await Promise.all(roots.map((root) => walkJsonFiles(path.join(workspaceRoot, root))))).flat();
  const records = [];

  for (const filePath of files) {
    const relativePath = toPosixRelative(filePath);
    const record = await readJson(relativePath);
    if (record?.record_type && record?.id) {
      records.push({ record, path: relativePath });
    }
  }

  return records.toSorted((left, right) => left.path.localeCompare(right.path));
}

async function loadBatchRuns() {
  return recordTypeEntries(await loadRecords([batchRunRoot]), "parallel_batch_run");
}

async function loadJobs(root) {
  return recordTypeEntries(await loadRecords([root]), "codex_job");
}

function groupBy(entries, keyForEntry) {
  const groups = new Map();
  for (const entry of entries) {
    const key = keyForEntry(entry);
    if (!key) {
      continue;
    }
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(entry);
  }
  return groups;
}

function proposedRecords(candidate) {
  return candidate.proposed_records ?? [];
}

function countAcceptedRecords(candidate) {
  return proposedRecords(candidate).filter(
    (record) => !acceptedRecordExcludedRecordTypes.includes(record.record_type)
  ).length;
}

function relatedAgentRunsForCandidate(agentRunsByCandidateId, candidateId) {
  return agentRunsByCandidateId.get(candidateId) ?? [];
}

function isExtractionCandidate({ candidate, agentRunsByCandidateId }) {
  const relatedAgentRuns = relatedAgentRunsForCandidate(agentRunsByCandidateId, candidate.id);
  return relatedAgentRuns.some(
    (entry) => entry.record.agent_role === "extraction_agent" || entry.record.mode === "extraction_refresh"
  );
}

function plannedBatchMetrics(batchPlan) {
  return (batchPlan?.batches ?? []).map((batch) => ({
    batch_id: batch.batch_id,
    parallel_group: batch.parallel_group,
    execution_class: batch.execution_class,
    reconciliation_required: Boolean(batch.reconciliation_required),
    job_count: batch.job_ids?.length ?? 0,
    expected_wall_time_ms: batch.expected_cost?.expected_wall_time_ms ?? 0,
    expected_token_budget: batch.expected_cost?.expected_token_budget ?? 0,
    overlapping_execution_key_count: batch.overlapping_execution_keys?.length ?? 0
  }));
}

function plannedGroupMetrics(batchPlan) {
  const groups = groupBy(batchPlan?.batches ?? [], (batch) => batch.parallel_group);
  return [...groups.entries()]
    .map(([parallelGroup, batches]) => ({
      parallel_group: parallelGroup,
      batch_count: batches.length,
      job_count: sum(batches.map((batch) => batch.job_ids?.length ?? 0)),
      independent_batch_count: batches.filter((batch) => batch.execution_class === "independent").length,
      reconciliation_batch_count: batches.filter((batch) => batch.execution_class === "reconciliation_required").length,
      max_batch_width: Math.max(0, ...batches.map((batch) => batch.job_ids?.length ?? 0)),
      expected_wall_time_ms: sum(batches.map((batch) => batch.expected_cost?.expected_wall_time_ms ?? 0)),
      expected_token_budget: sum(batches.map((batch) => batch.expected_cost?.expected_token_budget ?? 0)),
      overlapping_execution_key_count: sum(batches.map((batch) => batch.overlapping_execution_keys?.length ?? 0))
    }))
    .toSorted((left, right) => left.parallel_group.localeCompare(right.parallel_group));
}

function batchRunMetrics(batchRuns) {
  return batchRuns.map(({ record, path: runPath }) => ({
    batch_run_id: record.id,
    path: runPath,
    batch_id: record.batch_id,
    parallel_group: record.parallel_group,
    status: record.status,
    started_at: record.started_at,
    completed_at: record.completed_at,
    wall_time_ms: durationMs(record.started_at, record.completed_at),
    worker_count: record.worker_states?.length ?? 0,
    failed_worker_count: record.summary?.failed_count ?? 0,
    pending_reconciliation_worker_count: record.summary?.pending_reconciliation_count ?? 0,
    succeeded_worker_count: record.summary?.succeeded_count ?? 0
  }));
}

function workerStates(batchRuns) {
  return batchRuns.flatMap((entry) => entry.record.worker_states ?? []);
}

function duplicateWorkRecordCount(reconciliation) {
  return sum([
    ...(reconciliation?.duplicate_sources ?? []).map((finding) => finding.source_ids?.length ?? 0),
    ...(reconciliation?.duplicate_studies ?? []).map((finding) => finding.study_ids?.length ?? 0),
    ...(reconciliation?.overlapping_candidate_proposals ?? []).map((finding) => finding.candidate_change_ids?.length ?? 0)
  ]);
}

function acceptedCandidateMetrics({ acceptedCandidates, agentRunsByCandidateId }) {
  return acceptedCandidates.map(({ record: candidate }) => {
    const extractionRecords = proposedRecords(candidate).filter((record) => extractionDebtRecordTypes.includes(record.record_type));
    return {
      candidate_change_id: candidate.id,
      lifecycle_status: candidate.lifecycle_status,
      submitted_at: candidate.submitted_at,
      promoted_at: candidate.promotion?.promoted_at,
      proposed_record_count: proposedRecords(candidate).length,
      accepted_record_count: countAcceptedRecords(candidate),
      extraction_debt_record_count: extractionRecords.length,
      related_agent_run_ids: sortStrings(relatedAgentRunsForCandidate(agentRunsByCandidateId, candidate.id).map((entry) => entry.record.id))
    };
  }).toSorted((left, right) => left.candidate_change_id.localeCompare(right.candidate_change_id));
}

export async function buildOrchestrationMetrics({ generatedAt = new Date().toISOString() } = {}) {
  const batchPlan = await readOptionalJson(batchPlanPath, undefined);
  const reconciliation = await readOptionalJson(reconciliationPath, undefined);
  const triageState = await readOptionalJson(triageStatePath, undefined);
  const releaseReadiness = await readOptionalJson(releaseReadinessPath, undefined);
  const records = await loadRecords(canonicalRoots);
  const batchRuns = await loadBatchRuns();
  const liveJobs = await loadJobs(liveJobRoot);
  const archivedJobs = await loadJobs(archiveJobRoot);
  const exportFiles = (await walkFiles(path.join(workspaceRoot, exportRoot)))
    .map(toPosixRelative)
    .filter((filePath) => !filePath.endsWith("/.gitkeep") && !filePath.endsWith(".gitkeep"));

  const agentRunEntries = recordTypeEntries(records, "agent_run");
  const candidateEntries = recordTypeEntries(records, "candidate_change");
  const agentRunsByCandidateId = groupBy(agentRunEntries, (entry) => entry.record.outputs?.candidate_change_id);
  const acceptedCandidates = candidateEntries.filter((entry) => acceptedCandidateStatuses.has(entry.record.lifecycle_status));
  const acceptedRecords = acceptedCandidates.flatMap((entry) =>
    proposedRecords(entry.record).filter((record) => !acceptedRecordExcludedRecordTypes.includes(record.record_type))
  );
  const extractionResolvedCandidates = acceptedCandidates.filter((entry) =>
    isExtractionCandidate({ candidate: entry.record, agentRunsByCandidateId })
  );
  const extractionResolvedRecords = extractionResolvedCandidates.flatMap((entry) =>
    proposedRecords(entry.record).filter((record) => extractionDebtRecordTypes.includes(record.record_type))
  );

  const plannedBatches = plannedBatchMetrics(batchPlan);
  const plannedParallelWorkerCount = sum(plannedBatches.map((batch) => batch.job_count));
  const plannedSerialWallTimeMs = sum(liveJobs.map((entry) => entry.record.orchestration?.expected_cost?.expected_wall_time_ms ?? 0));
  const plannedParallelWallTimeMs = batchPlan?.summary?.estimated_wall_time_ms ?? 0;
  const batchRunsSummary = batchRunMetrics(batchRuns);
  const workers = workerStates(batchRuns);
  const workerDurations = workers.map((worker) => durationMs(worker.started_at, worker.completed_at));
  const agentRunDurations = agentRunEntries.map((entry) => durationMs(entry.record.started_at, entry.record.completed_at));
  const openFindingCount = reconciliation?.summary?.open_finding_count ?? 0;
  const activeCandidateCount = reconciliation?.summary?.active_candidate_count ?? candidateEntries.length;
  const plannedReconciliationBatchCount = batchPlan?.summary?.reconciliation_batch_count ?? 0;
  const plannedBatchCount = batchPlan?.summary?.batch_count ?? plannedBatches.length;
  const highPriorityExtractionDebtCount = (triageState?.extraction_debt ?? []).filter((item) => item.severity === "high").length;

  return {
    schema_version: "1.0.0",
    record_type: "orchestration_metrics",
    id: "orchestration-metrics-v1",
    generated_at: generatedAt,
    source_roots: sortStrings([
      ...canonicalRoots,
      batchPlanPath,
      batchRunRoot,
      liveJobRoot,
      archiveJobRoot,
      reconciliationPath,
      triageStatePath,
      releaseReadinessPath,
      exportRoot
    ]),
    metric_policy: {
      batch_plan_path: batchPlanPath,
      batch_run_root: batchRunRoot,
      live_job_root: liveJobRoot,
      archive_job_root: archiveJobRoot,
      reconciliation_path: reconciliationPath,
      triage_state_path: triageStatePath,
      release_readiness_path: releaseReadinessPath,
      export_root: exportRoot,
      accepted_candidate_statuses: [...acceptedCandidateStatuses].sort(),
      accepted_record_excluded_record_types: acceptedRecordExcludedRecordTypes,
      extraction_debt_record_types: extractionDebtRecordTypes
    },
    summary: {
      planned_live_job_count: liveJobs.length,
      archived_job_count: archivedJobs.length,
      planned_parallel_batch_count: plannedBatchCount,
      planned_parallel_worker_count: plannedParallelWorkerCount,
      planned_independent_batch_count: batchPlan?.summary?.independent_batch_count ?? 0,
      planned_reconciliation_batch_count: plannedReconciliationBatchCount,
      max_planned_batch_width: batchPlan?.summary?.max_batch_width ?? 0,
      planned_serial_wall_time_ms: plannedSerialWallTimeMs,
      planned_parallel_wall_time_ms: plannedParallelWallTimeMs,
      planned_wall_time_savings_ms: Math.max(0, plannedSerialWallTimeMs - plannedParallelWallTimeMs),
      planned_speedup_ratio: ratio(plannedSerialWallTimeMs, plannedParallelWallTimeMs),
      executed_parallel_batch_run_count: batchRuns.length,
      executed_worker_count: workers.length,
      failed_worker_count: workers.filter((worker) => worker.status === "failed").length,
      pending_reconciliation_worker_count: workers.filter((worker) => worker.status === "succeeded_pending_reconciliation").length,
      succeeded_worker_count: workers.filter((worker) => worker.status === "succeeded").length,
      actual_worker_wall_time_ms: sum(workerDurations),
      actual_batch_wall_time_ms: sum(batchRunsSummary.map((run) => run.wall_time_ms)),
      agent_run_count: agentRunEntries.length,
      succeeded_agent_run_count: agentRunEntries.filter((entry) => entry.record.status === "succeeded").length,
      partial_agent_run_count: agentRunEntries.filter((entry) => entry.record.status === "partial").length,
      failed_agent_run_count: agentRunEntries.filter((entry) => entry.record.status === "failed").length,
      agent_run_wall_time_ms: sum(agentRunDurations),
      duplicate_work_group_count: (reconciliation?.summary?.duplicate_source_group_count ?? 0)
        + (reconciliation?.summary?.duplicate_study_group_count ?? 0)
        + (reconciliation?.summary?.overlapping_candidate_group_count ?? 0),
      duplicate_work_record_count: duplicateWorkRecordCount(reconciliation),
      conflict_finding_count: openFindingCount,
      conflict_rate: ratio(plannedReconciliationBatchCount, plannedBatchCount),
      open_finding_rate: ratio(openFindingCount, activeCandidateCount),
      accepted_candidate_count: acceptedCandidates.length,
      accepted_records_produced_count: acceptedRecords.length,
      extraction_debt_open_count: triageState?.summary?.extraction_debt_count ?? 0,
      extraction_debt_high_priority_open_count: highPriorityExtractionDebtCount,
      extraction_debt_resolved_candidate_count: extractionResolvedCandidates.length,
      extraction_debt_resolved_record_count: extractionResolvedRecords.length,
      release_ready_candidate_count: releaseReadiness?.summary?.release_ready_candidate_count ?? 0,
      release_blocked_candidate_count: releaseReadiness?.summary?.release_blocked_candidate_count ?? 0,
      release_artifact_count: exportFiles.length,
      release_ready_record_count: releaseReadiness?.release_ready_records?.length ?? 0
    },
    planned_parallelism: {
      by_parallel_group: plannedGroupMetrics(batchPlan),
      batches: plannedBatches
    },
    worker_outcomes: {
      batch_runs: batchRunsSummary,
      worker_status_counts: countBy(workers.map((worker) => worker.status)),
      agent_run_status_counts: countBy(agentRunEntries.map((entry) => entry.record.status)),
      agent_run_role_counts: countBy(agentRunEntries.map((entry) => entry.record.agent_role))
    },
    output_value: {
      accepted_records_by_type: countBy(acceptedRecords.map((record) => record.record_type)),
      accepted_candidates: acceptedCandidateMetrics({ acceptedCandidates, agentRunsByCandidateId }),
      extraction_debt: {
        open_count: triageState?.summary?.extraction_debt_count ?? 0,
        high_priority_open_count: highPriorityExtractionDebtCount,
        resolved_candidate_count: extractionResolvedCandidates.length,
        resolved_record_count: extractionResolvedRecords.length,
        resolved_records_by_type: countBy(extractionResolvedRecords.map((record) => record.record_type))
      },
      release: {
        release_ready_candidate_count: releaseReadiness?.summary?.release_ready_candidate_count ?? 0,
        release_blocked_candidate_count: releaseReadiness?.summary?.release_blocked_candidate_count ?? 0,
        release_ready_record_count: releaseReadiness?.release_ready_records?.length ?? 0,
        blocked_accepted_record_count: releaseReadiness?.summary?.blocked_accepted_record_count ?? 0,
        release_artifact_count: exportFiles.length,
        export_files: exportFiles
      }
    },
    quality_pressure: {
      duplicate_work: {
        group_count: (reconciliation?.summary?.duplicate_source_group_count ?? 0)
          + (reconciliation?.summary?.duplicate_study_group_count ?? 0)
          + (reconciliation?.summary?.overlapping_candidate_group_count ?? 0),
        record_count: duplicateWorkRecordCount(reconciliation),
        duplicate_source_group_count: reconciliation?.summary?.duplicate_source_group_count ?? 0,
        duplicate_study_group_count: reconciliation?.summary?.duplicate_study_group_count ?? 0,
        overlapping_candidate_group_count: reconciliation?.summary?.overlapping_candidate_group_count ?? 0
      },
      conflicts: {
        open_finding_count: openFindingCount,
        blocking_finding_count: reconciliation?.summary?.blocking_finding_count ?? 0,
        warning_finding_count: reconciliation?.summary?.warning_finding_count ?? 0,
        conflict_rate: ratio(plannedReconciliationBatchCount, plannedBatchCount),
        open_finding_rate: ratio(openFindingCount, activeCandidateCount),
        reconciliation_batch_rate: ratio(plannedReconciliationBatchCount, plannedBatchCount)
      },
      worker_failures: {
        failed_worker_count: workers.filter((worker) => worker.status === "failed").length,
        partial_or_failed_agent_run_count: agentRunEntries.filter((entry) => ["partial", "failed"].includes(entry.record.status)).length
      }
    }
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const metrics = await buildOrchestrationMetrics();

  if (options.dryRun) {
    console.log(JSON.stringify(metrics, null, 2));
    return;
  }

  await writeJson(options.output, metrics);
  console.log(`Wrote ${options.output}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
