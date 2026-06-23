#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();

const smokeProof = {
  jobId: "orchestration-smoke-budgeted-codex-worktree-2026-06-23",
  jobPath: "ops/codex-jobs/archive/orchestration-smoke-budgeted-codex-worktree-2026-06-23.json",
  agentRunPath: "research/agent-runs/orchestration-smoke-budgeted-codex-worktree-2026-06-23.json",
  candidateId: "orchestration-smoke-budgeted-candidate-2026-06-23",
  candidatePath: "data/candidate-changes/orchestration-smoke-budgeted-candidate-2026-06-23.json"
};

const parallelProof = {
  runId: "parallel-synthetic-smoke-guard-level-2026-06-23",
  runPath: "ops/codex-batches/runs/parallel-synthetic-smoke-guard-level-2026-06-23.json",
  expectedWorkerCount: 2,
  workers: [
    {
      jobId: "orchestration-parallel-smoke-a-2026-06-23",
      jobPath: "ops/codex-jobs/archive/orchestration-parallel-smoke-a-2026-06-23.json",
      agentRunPath: "research/agent-runs/orchestration-parallel-smoke-a-2026-06-23.json",
      candidateId: "orchestration-parallel-smoke-a-candidate-2026-06-23",
      candidatePath: "data/candidate-changes/orchestration-parallel-smoke-a-candidate-2026-06-23.json"
    },
    {
      jobId: "orchestration-parallel-smoke-b-2026-06-23",
      jobPath: "ops/codex-jobs/archive/orchestration-parallel-smoke-b-2026-06-23.json",
      agentRunPath: "research/agent-runs/orchestration-parallel-smoke-b-2026-06-23.json",
      candidateId: "orchestration-parallel-smoke-b-candidate-2026-06-23",
      candidatePath: "data/candidate-changes/orchestration-parallel-smoke-b-candidate-2026-06-23.json"
    }
  ]
};

const requiredScripts = [
  "audit:exports",
  "audit:read-model",
  "audit:triage-state",
  "audit:release-readiness",
  "audit:parallel-batches",
  "audit:parallel-batch-runs",
  "audit:reconciliation",
  "audit:orchestration-metrics",
  "audit:codex-jobs",
  "audit:orchestration-smoke-contract",
  "audit:extraction-pilot-readiness",
  "audit:agentic-process",
  "test:scheduler-fixtures",
  "test:parallel-batch-runner",
  "test:audit-regressions"
];

const requiredRegressionCaseIds = [
  "placeholder-agent-run-reference",
  "stale-batch-pending-reconciliation-after-import",
  "succeeded-batch-worker-missing-output",
  "batch-run-summary-mismatch",
  "failed-batch-worker-without-issues",
  "post-step-failure-is-observable",
  "extraction-pilot-readiness-blocks-partial-proof"
];

function usage() {
  console.error("Usage: npm run audit:extraction-pilot-readiness -- [--require-clean]");
}

function parseArgs(argv) {
  const options = {
    requireClean: false
  };

  for (const arg of argv) {
    if (arg === "--require-clean") {
      options.requireClean = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function resolveRepoPath(relativeOrAbsolutePath) {
  return path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(workspaceRoot, relativeOrAbsolutePath);
}

async function exists(relativeOrAbsolutePath) {
  try {
    await fs.access(resolveRepoPath(relativeOrAbsolutePath));
    return true;
  } catch {
    return false;
  }
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(resolveRepoPath(relativePath), "utf8"));
}

function stableJson(value) {
  return JSON.stringify(value, null, 2);
}

function checkEqual(issues, field, expected, actual) {
  if (stableJson(expected) !== stableJson(actual)) {
    issues.push(`${field}: expected ${stableJson(expected)}, found ${stableJson(actual)}.`);
  }
}

function checkIncludes(issues, field, values, expectedValue) {
  if (!(values ?? []).includes(expectedValue)) {
    issues.push(`${field}: missing ${JSON.stringify(expectedValue)}.`);
  }
}

async function checkPath(issues, field, relativePath) {
  if (!(await exists(relativePath))) {
    issues.push(`${field}: path does not exist: ${relativePath}.`);
  }
}

function proposedRecordPaths(agentRun) {
  return (agentRun.outputs?.proposed_records ?? []).map((record) => record.path);
}

function checkSelfContainedCandidate(issues, label, candidate, expectedCandidateId, expectedCandidatePath) {
  checkEqual(issues, `${label}.record_type`, "candidate_change", candidate.record_type);
  checkEqual(issues, `${label}.id`, expectedCandidateId, candidate.id);
  checkEqual(issues, `${label}.lifecycle_status`, "submitted", candidate.lifecycle_status);
  checkEqual(issues, `${label}.proposed_records.length`, 1, candidate.proposed_records?.length ?? 0);
  checkEqual(issues, `${label}.proposed_records[0].record_type`, "candidate_change", candidate.proposed_records?.[0]?.record_type);
  checkEqual(issues, `${label}.proposed_records[0].record_id`, expectedCandidateId, candidate.proposed_records?.[0]?.record_id);
  checkEqual(issues, `${label}.proposed_records[0].path`, expectedCandidatePath, candidate.proposed_records?.[0]?.path);
}

async function checkSmokeProof(issues) {
  const startingIssueCount = issues.length;
  await checkPath(issues, "single-worker readiness proof job", smokeProof.jobPath);
  await checkPath(issues, "single-worker readiness proof agent_run", smokeProof.agentRunPath);
  await checkPath(issues, "single-worker readiness proof candidate", smokeProof.candidatePath);
  if (issues.length > startingIssueCount) {
    return;
  }

  const job = await readJson(smokeProof.jobPath);
  const agentRun = await readJson(smokeProof.agentRunPath);
  const candidate = await readJson(smokeProof.candidatePath);

  checkEqual(issues, "single-worker readiness proof job.id", smokeProof.jobId, job.id);
  checkEqual(issues, "single-worker readiness proof job.lifecycle_status", "succeeded", job.lifecycle_status);
  checkEqual(issues, "single-worker readiness proof job.final_agent_run_id", smokeProof.jobId, job.final_agent_run_id);
  checkEqual(issues, "single-worker readiness proof job.output_path", smokeProof.agentRunPath, job.output_path);
  checkEqual(issues, "single-worker readiness proof job.expected_outputs.candidate_change_id", smokeProof.candidateId, job.expected_outputs?.candidate_change_id);

  checkEqual(issues, "single-worker readiness proof agent_run.id", smokeProof.jobId, agentRun.id);
  checkEqual(issues, "single-worker readiness proof agent_run.status", "succeeded", agentRun.status);
  checkEqual(issues, "single-worker readiness proof agent_run.outputs.candidate_change_id", smokeProof.candidateId, agentRun.outputs?.candidate_change_id);
  checkEqual(issues, "single-worker readiness proof proposed paths", [smokeProof.candidatePath], proposedRecordPaths(agentRun));

  checkSelfContainedCandidate(
    issues,
    "single-worker readiness proof candidate",
    candidate,
    smokeProof.candidateId,
    smokeProof.candidatePath
  );
}

async function checkParallelWorker(issues, workerState, expectedWorker) {
  checkEqual(issues, `parallel readiness proof worker ${expectedWorker.jobId}.status`, "succeeded", workerState?.status);
  checkEqual(issues, `parallel readiness proof worker ${expectedWorker.jobId}.exit_code`, 0, workerState?.exit_code);
  checkEqual(issues, `parallel readiness proof worker ${expectedWorker.jobId}.output_path`, expectedWorker.agentRunPath, workerState?.output_path);
  checkEqual(issues, `parallel readiness proof worker ${expectedWorker.jobId}.archive_path`, expectedWorker.jobPath, workerState?.archive_path);

  const startingIssueCount = issues.length;
  await checkPath(issues, `parallel readiness proof worker ${expectedWorker.jobId} job`, expectedWorker.jobPath);
  await checkPath(issues, `parallel readiness proof worker ${expectedWorker.jobId} agent_run`, expectedWorker.agentRunPath);
  await checkPath(issues, `parallel readiness proof worker ${expectedWorker.jobId} candidate`, expectedWorker.candidatePath);
  if (issues.length > startingIssueCount) {
    return;
  }

  const job = await readJson(expectedWorker.jobPath);
  const agentRun = await readJson(expectedWorker.agentRunPath);
  const candidate = await readJson(expectedWorker.candidatePath);

  checkEqual(issues, `parallel readiness proof job ${expectedWorker.jobId}.id`, expectedWorker.jobId, job.id);
  checkEqual(issues, `parallel readiness proof job ${expectedWorker.jobId}.lifecycle_status`, "succeeded", job.lifecycle_status);
  checkEqual(issues, `parallel readiness proof job ${expectedWorker.jobId}.final_agent_run_id`, expectedWorker.jobId, job.final_agent_run_id);
  checkEqual(issues, `parallel readiness proof job ${expectedWorker.jobId}.output_path`, expectedWorker.agentRunPath, job.output_path);

  checkEqual(issues, `parallel readiness proof agent_run ${expectedWorker.jobId}.id`, expectedWorker.jobId, agentRun.id);
  checkEqual(issues, `parallel readiness proof agent_run ${expectedWorker.jobId}.status`, "succeeded", agentRun.status);
  checkEqual(issues, `parallel readiness proof agent_run ${expectedWorker.jobId}.outputs.candidate_change_id`, expectedWorker.candidateId, agentRun.outputs?.candidate_change_id);
  checkEqual(issues, `parallel readiness proof agent_run ${expectedWorker.jobId} proposed paths`, [expectedWorker.candidatePath], proposedRecordPaths(agentRun));

  checkSelfContainedCandidate(
    issues,
    `parallel readiness proof candidate ${expectedWorker.candidateId}`,
    candidate,
    expectedWorker.candidateId,
    expectedWorker.candidatePath
  );
}

async function checkParallelProof(issues) {
  const startingIssueCount = issues.length;
  await checkPath(issues, "parallel readiness proof run", parallelProof.runPath);
  if (issues.length > startingIssueCount) {
    return;
  }

  const run = await readJson(parallelProof.runPath);
  checkEqual(issues, "parallel readiness proof run.id", parallelProof.runId, run.id);
  checkEqual(issues, "parallel readiness proof run.status", "succeeded", run.status);
  checkEqual(issues, "parallel readiness proof run.execution_class", "independent", run.execution_class);
  checkEqual(issues, "parallel readiness proof run.summary.succeeded_count", parallelProof.expectedWorkerCount, run.summary?.succeeded_count);
  checkEqual(issues, "parallel readiness proof run.summary.failed_count", 0, run.summary?.failed_count);
  checkEqual(issues, "parallel readiness proof run.summary.pending_reconciliation_count", 0, run.summary?.pending_reconciliation_count);
  checkEqual(issues, "parallel readiness proof run.worker_states.length", parallelProof.expectedWorkerCount, run.worker_states?.length ?? 0);

  for (const expectedWorker of parallelProof.workers) {
    const workerState = (run.worker_states ?? []).find((worker) => worker.job_id === expectedWorker.jobId);
    if (!workerState) {
      issues.push(`parallel readiness proof worker missing: ${expectedWorker.jobId}.`);
      continue;
    }
    await checkParallelWorker(issues, workerState, expectedWorker);
  }
}

async function checkMetrics(issues) {
  const metricsPath = "ops/codex-batches/orchestration-metrics.v1.json";
  const startingIssueCount = issues.length;
  await checkPath(issues, "orchestration metrics", metricsPath);
  if (issues.length > startingIssueCount) {
    return;
  }

  const metrics = await readJson(metricsPath);
  const proofMetric = (metrics.worker_outcomes?.batch_runs ?? []).find(
    (batchRun) => batchRun.batch_run_id === parallelProof.runId
  );
  if (!proofMetric) {
    issues.push(`orchestration metrics: missing readiness proof run ${parallelProof.runId}.`);
    return;
  }

  checkEqual(issues, "orchestration metrics readiness proof status", "succeeded", proofMetric.status);
  checkEqual(issues, "orchestration metrics readiness proof worker_count", parallelProof.expectedWorkerCount, proofMetric.worker_count);
  checkEqual(issues, "orchestration metrics readiness proof failed_worker_count", 0, proofMetric.failed_worker_count);
  checkEqual(
    issues,
    "orchestration metrics readiness proof pending_reconciliation_worker_count",
    0,
    proofMetric.pending_reconciliation_worker_count
  );
  checkEqual(issues, "orchestration metrics readiness proof succeeded_worker_count", parallelProof.expectedWorkerCount, proofMetric.succeeded_worker_count);
}

async function checkReconciliation(issues) {
  const reconciliationPath = "ops/reconciliation/parallel-reconciliation.v1.json";
  const startingIssueCount = issues.length;
  await checkPath(issues, "parallel reconciliation report", reconciliationPath);
  if (issues.length > startingIssueCount) {
    return;
  }

  const reconciliation = await readJson(reconciliationPath);
  checkEqual(issues, "parallel reconciliation pending worker count", 0, reconciliation.summary?.pending_parallel_worker_count);

  const proofIssueSources = new Set([
    parallelProof.runId,
    parallelProof.runPath,
    ...parallelProof.workers.flatMap((worker) => [
      worker.jobId,
      worker.jobPath,
      worker.agentRunPath,
      worker.candidateId,
      worker.candidatePath
    ])
  ]);
  const activeProofIssues = (reconciliation.open_findings ?? []).filter((finding) => {
    const serialized = JSON.stringify(finding);
    return [...proofIssueSources].some((source) => serialized.includes(source));
  });

  if (activeProofIssues.length > 0) {
    issues.push(`parallel reconciliation report: readiness proof has ${activeProofIssues.length} active issue(s).`);
  }
}

async function checkVerificationWiring(issues) {
  const packageJson = await readJson("package.json");
  const verifyCommand = packageJson.scripts?.["verify:knowledge-base"] ?? "";

  for (const scriptName of requiredScripts) {
    if (!packageJson.scripts?.[scriptName]) {
      issues.push(`package.json scripts: missing ${scriptName}.`);
    }
    if (!verifyCommand.includes(`npm run ${scriptName}`)) {
      issues.push(`verify:knowledge-base: missing npm run ${scriptName}.`);
    }
  }

  if (!packageJson.scripts?.["audit:extraction-pilot-readiness:clean"]?.includes("--require-clean")) {
    issues.push("package.json scripts: audit:extraction-pilot-readiness:clean must pass --require-clean.");
  }

  const regressionManifest = await readJson("tests/fixtures/audit-regressions.json");
  const caseIds = new Set((regressionManifest.cases ?? []).map((testCase) => testCase.id));
  for (const caseId of requiredRegressionCaseIds) {
    if (!caseIds.has(caseId)) {
      issues.push(`audit regression fixtures: missing ${caseId}.`);
    }
  }

  const schedulerFixtures = await readJson("tests/fixtures/scheduler-fixtures.json");
  const schedulerCaseIds = new Set((schedulerFixtures.fixtures ?? []).map((testCase) => testCase.id));
  if (!schedulerCaseIds.has("overlap-without-reconciliation-serializes")) {
    issues.push("scheduler fixtures: missing overlap-without-reconciliation-serializes.");
  }
}

function checkCleanWorktree(issues) {
  const result = spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], {
    cwd: workspaceRoot,
    encoding: "utf8"
  });

  if (result.error) {
    issues.push(`clean worktree check: git failed to start: ${result.error.message}.`);
    return;
  }
  if (result.status !== 0) {
    issues.push(`clean worktree check: git exited ${result.status}: ${(result.stderr ?? "").trim()}.`);
    return;
  }
  if ((result.stdout ?? "").trim()) {
    issues.push("clean worktree check: pending file changes exist; commit or stash before the extraction pilot.");
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const issues = [];

  await checkSmokeProof(issues);
  await checkParallelProof(issues);
  await checkMetrics(issues);
  await checkReconciliation(issues);
  await checkVerificationWiring(issues);
  if (options.requireClean) {
    checkCleanWorktree(issues);
  }

  if (issues.length > 0) {
    console.error(`Extraction-pilot readiness audit failed with ${issues.length} issue(s):`);
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  const cleanMode = options.requireClean ? " with clean-worktree enforcement" : "";
  console.log(`Extraction-pilot readiness audit passed${cleanMode}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
