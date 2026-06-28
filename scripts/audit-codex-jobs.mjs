#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const jobRoot = path.join(workspaceRoot, "ops", "codex-jobs");
const liveJobPathPrefix = "ops/codex-jobs/live/";
const archiveJobPathPrefix = "ops/codex-jobs/archive/";
const activeJobStatuses = new Set(["planned", "ready", "running"]);
const finalJobStatuses = new Set(["succeeded", "failed", "superseded", "archived"]);
const safetyScopePattern = /\b(safety|adverse[-_ ]?event|adverse|harm|tolerability|toxicity)\b/i;
const safetyLaneGovernanceRecordTypes = new Set([
  "agent_run",
  "candidate_change",
  "evidence_review",
  "research_session",
  "screening_run",
  "search_log"
]);
const aggregateQualityGateChecks = {
  audit_exports: new Set(["verify_knowledge_base", "post_verify"]),
  audit_triage_state: new Set(["verify_knowledge_base", "post_verify"]),
  audit_reconciliation: new Set(["verify_knowledge_base", "post_verify"]),
  audit_agent_schemas: new Set(["verify_knowledge_base", "post_verify"]),
  audit_agentic_process: new Set(["verify_knowledge_base", "post_verify"])
};
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

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(workspaceRoot, relativePath), "utf8"));
}

async function buildRecordIndex() {
  const files = (await Promise.all(["data", "research"].map((root) => walkJsonFiles(path.join(workspaceRoot, root))))).flat();
  const byTypeAndId = new Map();

  for (const filePath of files) {
    const relativePath = toPosixRelative(filePath);
    const record = await readJson(relativePath);
    if (record?.record_type && record?.id) {
      byTypeAndId.set(`${record.record_type}:${record.id}`, { record, path: relativePath });
    }
  }

  return { byTypeAndId };
}

function sortedArray(value) {
  return [...(value ?? [])].sort();
}

function stableArrayLabel(value) {
  return sortedArray(value).join(", ");
}

function checkEqual({ issues, ownerPath, field, expected, actual }) {
  if (expected === undefined) {
    return;
  }

  if (actual !== expected) {
    issues.push(`${ownerPath}: expected ${field} "${expected}", found "${actual}".`);
  }
}

function checkArrayEqual({ issues, ownerPath, field, expected, actual }) {
  if (expected === undefined) {
    return;
  }

  const expectedSorted = sortedArray(expected);
  const actualSorted = sortedArray(actual);
  if (expectedSorted.length !== actualSorted.length) {
    issues.push(`${ownerPath}: expected ${field} ${expectedSorted.length} item(s), found ${actualSorted.length}.`);
    return;
  }

  for (const [index, expectedValue] of expectedSorted.entries()) {
    if (actualSorted[index] !== expectedValue) {
      issues.push(`${ownerPath}: expected ${field} [${stableArrayLabel(expectedSorted)}], found [${stableArrayLabel(actualSorted)}].`);
      return;
    }
  }
}

function arraysEqual(left, right) {
  const leftSorted = sortedArray(left);
  const rightSorted = sortedArray(right);
  if (leftSorted.length !== rightSorted.length) {
    return false;
  }
  return leftSorted.every((value, index) => value === rightSorted[index]);
}

function expectedCandidateReviewLanesForJobCandidate(job, candidate) {
  const expectedLanes = new Set(job.expected_outputs?.required_review_lanes ?? []);

  for (const proposedRecord of candidate.proposed_records ?? []) {
    const searchableText = [
      proposedRecord.record_type,
      proposedRecord.record_id,
      proposedRecord.path,
      proposedRecord.rationale
    ].join(" ");
    if (!safetyLaneGovernanceRecordTypes.has(proposedRecord.record_type) && safetyScopePattern.test(searchableText)) {
      expectedLanes.add("safety_limitations");
    }
  }

  return [...expectedLanes].sort();
}

function isLegacyGovernanceSafetyLaneSuperset(job, candidate, expectedLanes) {
  if (!finalJobStatuses.has(job.lifecycle_status)) {
    return false;
  }

  const actualLanes = candidate.required_review_lanes ?? [];
  if (!arraysEqual(actualLanes, [...expectedLanes, "safety_limitations"])) {
    return false;
  }

  return (candidate.proposed_records ?? []).every((proposedRecord) =>
    safetyLaneGovernanceRecordTypes.has(proposedRecord.record_type)
  );
}

function checkCandidateReviewLanes({ issues, ownerPath, job, candidate }) {
  const expectedLanes = expectedCandidateReviewLanesForJobCandidate(job, candidate);
  if (arraysEqual(candidate.required_review_lanes, expectedLanes)) {
    return;
  }

  if (isLegacyGovernanceSafetyLaneSuperset(job, candidate, expectedLanes)) {
    return;
  }

  checkArrayEqual({
    issues,
    ownerPath,
    field: "candidate_change.required_review_lanes[]",
    expected: expectedLanes,
    actual: candidate.required_review_lanes
  });
}

function checkPathExists({ issues, ownerPath, field, relativePath }) {
  if (!relativePath) {
    return Promise.resolve();
  }

  const resolvedPath = path.resolve(workspaceRoot, relativePath);
  const normalizedPath = toPosixRelative(resolvedPath);
  if (!normalizedPath || normalizedPath.startsWith("..")) {
    issues.push(`${ownerPath}: ${field} must stay inside the repository: ${relativePath}.`);
    return Promise.resolve();
  }

  return exists(resolvedPath).then((pathExists) => {
    if (!pathExists) {
      issues.push(`${ownerPath}: ${field} path does not exist: ${relativePath}.`);
    }
  });
}

async function readOptionalJson({ issues, ownerPath, field, relativePath }) {
  if (!relativePath) {
    return undefined;
  }

  const resolvedPath = path.resolve(workspaceRoot, relativePath);
  const normalizedPath = toPosixRelative(resolvedPath);
  if (!normalizedPath || normalizedPath.startsWith("..")) {
    issues.push(`${ownerPath}: ${field} must stay inside the repository: ${relativePath}.`);
    return undefined;
  }

  if (!(await exists(resolvedPath))) {
    issues.push(`${ownerPath}: ${field} path does not exist: ${relativePath}.`);
    return undefined;
  }

  try {
    return JSON.parse(await fs.readFile(resolvedPath, "utf8"));
  } catch (error) {
    issues.push(`${ownerPath}: ${field} is not valid JSON: ${error.message}`);
    return undefined;
  }
}

function candidateChangeIdsFromReadSets(readSets) {
  return (readSets ?? [])
    .map((key) => key.match(/^path:data\/candidate-changes\/([^/]+)\.json$/)?.[1])
    .filter(Boolean)
    .sort();
}

function hasReviewLaneConflictKey({ conflictKeys, candidateChangeIds, lane }) {
  if (conflictKeys.includes(`review_lane:${lane}`)) {
    return true;
  }

  return candidateChangeIds.some((candidateChangeId) => conflictKeys.includes(`candidate_review:${candidateChangeId}/${lane}`));
}

function checkCandidateReviewLaneOrchestration({ issues, ownerPath, job, readSets, writeSets, conflictKeys }) {
  if (job.agent_role !== "supervisor_agent" || job.orchestration?.parallel_group !== "candidate-review") {
    return;
  }

  const expectedLanes = job.expected_outputs?.required_review_lanes ?? [];
  const candidateChangeIds = candidateChangeIdsFromReadSets(readSets);
  const repairCandidatePath = job.expected_outputs?.candidate_change_id
    ? `path:data/candidate-changes/${job.expected_outputs.candidate_change_id}.json`
    : undefined;

  if (expectedLanes.length !== 1) {
    issues.push(`${ownerPath}: candidate-review parallel jobs must declare exactly one required_review_lanes[] item.`);
  }

  if (candidateChangeIds.length !== 1) {
    issues.push(`${ownerPath}: candidate-review parallel jobs must read exactly one source candidate_change path.`);
    return;
  }

  const [candidateChangeId] = candidateChangeIds;
  for (const lane of expectedLanes) {
    const laneKey = `candidate_review:${candidateChangeId}/${lane}`;
    if (!writeSets.includes(laneKey)) {
      issues.push(`${ownerPath}: candidate-review lane job orchestration.write_sets missing lane key "${laneKey}".`);
    }
    if (!conflictKeys.includes(laneKey)) {
      issues.push(`${ownerPath}: candidate-review lane job orchestration.conflict_keys missing lane key "${laneKey}".`);
    }
  }

  for (const writeKey of writeSets) {
    if (writeKey.startsWith("target_record:candidate_change/")) {
      issues.push(`${ownerPath}: candidate-review lane jobs must use lane-scoped write keys instead of broad "${writeKey}".`);
    }
    if (writeKey.startsWith("path:data/candidate-changes/") && writeKey !== repairCandidatePath) {
      issues.push(`${ownerPath}: candidate-review lane jobs must not write the source candidate path "${writeKey}".`);
    }
  }
}

function normalizeQualityCheckName(checkName) {
  return String(checkName ?? "")
    .trim()
    .toLowerCase()
    .replace(/^npm\s+run\s+/, "")
    .replace(/[:\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function qualityChecksByName(agentRun) {
  const checks = new Map();
  for (const check of agentRun.quality_checks ?? []) {
    checks.set(check.check_name, check);
    checks.set(normalizeQualityCheckName(check.check_name), check);
  }
  return checks;
}

function hasPassedQualityCheck(checks, checkName) {
  return checks.get(checkName)?.status === "passed" || checks.get(normalizeQualityCheckName(checkName))?.status === "passed";
}

function checkQualityGate({ issues, ownerPath, checks, gate }) {
  if (hasPassedQualityCheck(checks, gate)) {
    return;
  }

  const aggregateChecks = aggregateQualityGateChecks[gate] ?? new Set();
  for (const aggregateCheck of aggregateChecks) {
    if (hasPassedQualityCheck(checks, aggregateCheck)) {
      return;
    }
  }

  issues.push(`${ownerPath}: quality gate "${gate}" is not satisfied by a passed quality_checks[] entry.`);
}

function checkCandidateAgentRunLedgerMatch({ issues, ownerPath, candidate, agentRun }) {
  const candidatePaths = sortedArray((candidate.proposed_records ?? []).map((record) => record.path));
  const agentRunPaths = sortedArray((agentRun.outputs?.proposed_records ?? []).map((record) => record.path));

  if (candidatePaths.length !== agentRunPaths.length) {
    issues.push(
        `${ownerPath}: candidate_agent_run_ledger_match expected ${candidatePaths.length} candidate path(s), found ${agentRunPaths.length} agent-run path(s).`
    );
    return false;
  }

  for (const [index, candidatePath] of candidatePaths.entries()) {
    if (agentRunPaths[index] !== candidatePath) {
      issues.push(
        `${ownerPath}: candidate_agent_run_ledger_match expected candidate paths [${stableArrayLabel(candidatePaths)}], found agent-run paths [${stableArrayLabel(agentRunPaths)}].`
      );
      return false;
    }
  }

  return true;
}

function checkJobLifecycle({ issues, job, ownerPath, outputExists }) {
  const isActiveJob = activeJobStatuses.has(job.lifecycle_status);
  const isFinalJob = finalJobStatuses.has(job.lifecycle_status);
  const isLivePath = ownerPath.startsWith(liveJobPathPrefix);
  const isArchivePath = ownerPath.startsWith(archiveJobPathPrefix);

  if (!isLivePath && !isArchivePath) {
    issues.push(`${ownerPath}: codex_job files must live under ${liveJobPathPrefix} or ${archiveJobPathPrefix}.`);
  }

  if (isActiveJob && !isLivePath) {
    issues.push(`${ownerPath}: lifecycle_status "${job.lifecycle_status}" must live under ${liveJobPathPrefix}.`);
  }

  if (isFinalJob && !isArchivePath) {
    issues.push(`${ownerPath}: lifecycle_status "${job.lifecycle_status}" must live under ${archiveJobPathPrefix}.`);
  }

  if (isActiveJob && outputExists) {
    issues.push(`${ownerPath}: live job already has output_path; archive it or update lifecycle_status.`);
  }

  if (isFinalJob && !outputExists) {
    issues.push(`${ownerPath}: archived/final job must keep an existing output_path.`);
  }

  if (isFinalJob) {
    checkEqual({
      issues,
      ownerPath,
      field: "final_agent_run_id",
      expected: job.id,
      actual: job.final_agent_run_id
    });
  }
}

function scopedRecordReadPaths(recordIndex, scope) {
  const scopedRecordTypes = [
    ["source", scope?.source_ids],
    ["study", scope?.study_ids],
    ["outcome", scope?.outcome_ids],
    ["result", scope?.result_ids]
  ];
  const paths = [];

  for (const [recordType, recordIds] of scopedRecordTypes) {
    for (const recordId of recordIds ?? []) {
      const recordPath = recordIndex.byTypeAndId.get(`${recordType}:${recordId}`)?.path;
      if (recordPath) {
        paths.push(recordPath);
      }
    }
  }

  return sortedArray(new Set(paths));
}

function checkOrchestrationMetadata({ issues, job, ownerPath, recordIndex }) {
  const orchestration = job.orchestration ?? {};
  const readSets = orchestration.read_sets ?? [];
  const writeSets = orchestration.write_sets ?? [];
  const conflictKeys = orchestration.conflict_keys ?? [];

  if (readSets.length === 0) {
    issues.push(`${ownerPath}: orchestration.read_sets must declare at least one dependency key.`);
  }

  if ((job.expected_outputs?.canonical_write_policy === "candidate_change_required" || job.execution?.sandbox === "workspace-write") && writeSets.length === 0) {
    issues.push(`${ownerPath}: orchestration.write_sets must declare planned write keys for jobs that can modify canonical state.`);
  }

  if (writeSets.length > 0 && conflictKeys.length === 0) {
    issues.push(`${ownerPath}: orchestration.conflict_keys must declare serialization keys when write_sets are present.`);
  }

  for (const proposedPath of job.expected_outputs?.proposed_record_paths ?? []) {
    const writeKey = `path:${proposedPath}`;
    if (!writeSets.includes(writeKey)) {
      issues.push(`${ownerPath}: orchestration.write_sets missing expected proposed record path key "${writeKey}".`);
    }
  }

  if (job.expected_outputs?.candidate_change_id) {
    const candidateConflictKey = `candidate_change:${job.expected_outputs.candidate_change_id}`;
    if (!conflictKeys.includes(candidateConflictKey)) {
      issues.push(`${ownerPath}: orchestration.conflict_keys missing candidate key "${candidateConflictKey}".`);
    }
  }

  if (job.agent_role === "supervisor_agent") {
    const candidateChangeIds = candidateChangeIdsFromReadSets(readSets);
    for (const lane of job.expected_outputs?.required_review_lanes ?? []) {
      const reviewLaneConflictKey = `review_lane:${lane}`;
      if (!hasReviewLaneConflictKey({ conflictKeys, candidateChangeIds, lane })) {
        issues.push(`${ownerPath}: supervisor job orchestration.conflict_keys missing review lane key "${reviewLaneConflictKey}" or a candidate-scoped candidate_review lane key.`);
      }
    }
  }

  checkCandidateReviewLaneOrchestration({ issues, ownerPath, job, readSets, writeSets, conflictKeys });

  if (ownerPath.startsWith(liveJobPathPrefix) && job.agent_role === "extraction_agent" && activeJobStatuses.has(job.lifecycle_status)) {
    for (const recordPath of scopedRecordReadPaths(recordIndex, job.scope)) {
      const readKey = `path:${recordPath}`;
      if (!readSets.includes(readKey)) {
        issues.push(`${ownerPath}: extraction job orchestration.read_sets missing scoped record key "${readKey}".`);
      }
    }
  }

  if (job.execution?.sandbox === "read-only" && writeSets.length > 0) {
    issues.push(`${ownerPath}: read-only jobs must not declare orchestration.write_sets.`);
  }
}

function isCandidateReviewLaneJob(job) {
  return job.agent_role === "supervisor_agent" && job.orchestration?.parallel_group === "candidate-review";
}

function checkContextPackCommon({ issues, job, ownerPath, contextPack }) {
  const readSets = job.orchestration?.read_sets ?? [];
  if (!readSets.includes(`context_pack:${contextPack.id}`)) {
    issues.push(`${ownerPath}: orchestration.read_sets missing context pack key "context_pack:${contextPack.id}".`);
  }

  for (const field of ["hallmark_ids", "track_ids", "intervention_ids", "source_ids", "study_ids", "outcome_ids", "result_ids"]) {
    checkArrayEqual({
      issues,
      ownerPath,
      field: `context_pack.scope.${field}`,
      expected: contextPack.scope?.[field],
      actual: job.scope?.[field]
    });
  }

  checkEqual({
    issues,
    ownerPath,
    field: "context_pack.expected_outputs.candidate_change_id",
    expected: contextPack.expected_outputs?.candidate_change_id,
    actual: job.expected_outputs?.candidate_change_id
  });
  checkArrayEqual({
    issues,
    ownerPath,
    field: "context_pack.expected_outputs.proposed_record_paths",
    expected: contextPack.expected_outputs?.proposed_record_paths,
    actual: job.expected_outputs?.proposed_record_paths
  });
  checkArrayEqual({
    issues,
    ownerPath,
    field: "context_pack.expected_outputs.generated_file_paths",
    expected: contextPack.expected_outputs?.generated_file_paths,
    actual: job.expected_outputs?.generated_file_paths
  });
  checkArrayEqual({
    issues,
    ownerPath,
    field: "context_pack.expected_outputs.export_paths",
    expected: contextPack.expected_outputs?.export_paths,
    actual: job.expected_outputs?.export_paths
  });
  checkArrayEqual({
    issues,
    ownerPath,
    field: "context_pack.expected_outputs.required_review_lanes",
    expected: contextPack.expected_outputs?.required_review_lanes,
    actual: job.expected_outputs?.required_review_lanes
  });
}

function checkExtractionContextPack({ issues, job, ownerPath, contextPack }) {
  if (job.agent_role !== "extraction_agent") {
    issues.push(`${ownerPath}: extraction_context_pack can only be used by extraction-agent jobs.`);
    return;
  }

  checkContextPackCommon({ issues, job, ownerPath, contextPack });
}

function checkSupervisorReviewContextPack({ issues, job, ownerPath, contextPack }) {
  if (!isCandidateReviewLaneJob(job)) {
    issues.push(`${ownerPath}: supervisor_review_context_pack can only be used by candidate-review supervisor lane jobs.`);
    return;
  }

  checkContextPackCommon({ issues, job, ownerPath, contextPack });

  const readSets = job.orchestration?.read_sets ?? [];
  const targetCandidatePath = contextPack.target_candidate?.path;
  if (targetCandidatePath && !readSets.includes(`path:${targetCandidatePath}`)) {
    issues.push(`${ownerPath}: orchestration.read_sets missing target candidate path key "path:${targetCandidatePath}".`);
  }

  const expectedLanes = job.expected_outputs?.required_review_lanes ?? [];
  if (expectedLanes.length !== 1 || expectedLanes[0] !== contextPack.review_lane) {
    issues.push(`${ownerPath}: context_pack.review_lane must match the job's single expected review lane.`);
  }
}

async function checkContextPack({ issues, job, ownerPath }) {
  const isRunnableLiveJob = ownerPath.startsWith(liveJobPathPrefix) && activeJobStatuses.has(job.lifecycle_status);
  const isExtractionRefresh = job.mode === "extraction_refresh" && job.agent_role === "extraction_agent";
  const isSupervisorCandidateReview = isCandidateReviewLaneJob(job);

  if (isRunnableLiveJob && isExtractionRefresh && !job.context_pack_path) {
    issues.push(`${ownerPath}: live extraction-refresh jobs must declare context_pack_path.`);
    return;
  }

  if (isRunnableLiveJob && isSupervisorCandidateReview && !job.context_pack_path) {
    issues.push(`${ownerPath}: live candidate-review supervisor lane jobs must declare context_pack_path.`);
    return;
  }

  if (!job.context_pack_path) {
    return;
  }

  const contextPack = await readOptionalJson({
    issues,
    ownerPath,
    field: "context_pack_path",
    relativePath: job.context_pack_path
  });

  if (!contextPack) {
    return;
  }

  if (contextPack.record_type === "extraction_context_pack") {
    checkExtractionContextPack({ issues, job, ownerPath, contextPack });
    return;
  }

  if (contextPack.record_type === "supervisor_review_context_pack") {
    checkSupervisorReviewContextPack({ issues, job, ownerPath, contextPack });
    return;
  }

  issues.push(`${ownerPath}: context_pack_path references unsupported record_type "${contextPack.record_type}".`);
}

async function checkCodexJob({ issues, job, ownerPath, recordIndex }) {
  await checkPathExists({ issues, ownerPath, field: "prompt_file", relativePath: job.prompt_file });
  await checkPathExists({ issues, ownerPath, field: "execution.output_schema_path", relativePath: job.execution?.output_schema_path });
  const outputExists = await exists(path.join(workspaceRoot, job.output_path));

  checkJobLifecycle({ issues, job, ownerPath, outputExists });
  checkOrchestrationMetadata({ issues, job, ownerPath, recordIndex });
  await checkContextPack({ issues, job, ownerPath });

  if (job.post_run?.verify_knowledge_base && !job.post_run?.export_latest) {
    issues.push(
      `${ownerPath}: post_run.verify_knowledge_base must also set post_run.export_latest so the final agent_run record cannot stale export audits.`
    );
  }

  if (!outputExists) {
    return;
  }

  await checkPathExists({ issues, ownerPath, field: "jsonl_log_path", relativePath: job.jsonl_log_path });
  const commandLogPath = job.jsonl_log_path?.replace(/\.jsonl$/, ".command.jsonl");
  await checkPathExists({ issues, ownerPath, field: "command_log_path", relativePath: commandLogPath });

  const agentRun = await readJson(job.output_path);
  const checks = qualityChecksByName(agentRun);
  const auditSatisfiedQualityGates = new Set();

  checkEqual({ issues, ownerPath, field: "agent_run.id", expected: job.id, actual: agentRun.id });
  checkEqual({ issues, ownerPath, field: "agent_run.id", expected: job.final_agent_run_id, actual: agentRun.id });
  checkEqual({ issues, ownerPath, field: "agent_run.agent_role", expected: job.agent_role, actual: agentRun.agent_role });
  checkEqual({ issues, ownerPath, field: "agent_run.mode", expected: job.mode, actual: agentRun.mode });
  checkEqual({
    issues,
    ownerPath,
    field: "agent_run.canonical_write_policy",
    expected: job.expected_outputs?.canonical_write_policy,
    actual: agentRun.canonical_write_policy
  });

  checkEqual({ issues, ownerPath, field: "execution.surface", expected: "codex_exec", actual: agentRun.execution?.surface });
  checkEqual({ issues, ownerPath, field: "execution.isolation", expected: job.execution?.isolation, actual: agentRun.execution?.isolation });
  if (agentRun.execution?.prompt_template_file) {
    checkEqual({
      issues,
      ownerPath,
      field: "execution.prompt_template_file",
      expected: job.prompt_file,
      actual: agentRun.execution.prompt_template_file
    });
  } else {
    checkEqual({ issues, ownerPath, field: "execution.prompt_file", expected: job.prompt_file, actual: agentRun.execution?.prompt_file });
  }
  if (agentRun.execution?.job_file) {
    checkEqual({ issues, ownerPath, field: "execution.job_file", expected: ownerPath, actual: agentRun.execution.job_file });
  }
  checkEqual({
    issues,
    ownerPath,
    field: "execution.output_schema_path",
    expected: job.execution?.output_schema_path,
    actual: agentRun.execution?.output_schema_path
  });
  checkEqual({ issues, ownerPath, field: "execution.output_path", expected: job.output_path, actual: agentRun.execution?.output_path });
  checkEqual({ issues, ownerPath, field: "execution.jsonl_log_path", expected: job.jsonl_log_path, actual: agentRun.execution?.jsonl_log_path });
  checkEqual({ issues, ownerPath, field: "execution.sandbox", expected: job.execution?.sandbox, actual: agentRun.execution?.sandbox });
  checkEqual({
    issues,
    ownerPath,
    field: "execution.approval_policy",
    expected: job.execution?.approval_policy,
    actual: agentRun.execution?.approval_policy
  });

  for (const field of ["hallmark_ids", "track_ids", "intervention_ids"]) {
    checkArrayEqual({ issues, ownerPath, field: `scope.${field}`, expected: job.scope?.[field], actual: agentRun.scope?.[field] });
  }

  checkEqual({
    issues,
    ownerPath,
    field: "outputs.candidate_change_id",
    expected: job.expected_outputs?.candidate_change_id,
    actual: agentRun.outputs?.candidate_change_id
  });
  checkArrayEqual({
    issues,
    ownerPath,
    field: "outputs.proposed_records[].path",
    expected: job.expected_outputs?.proposed_record_paths,
    actual: (agentRun.outputs?.proposed_records ?? []).map((record) => record.path)
  });
  checkArrayEqual({
    issues,
    ownerPath,
    field: "outputs.generated_files[]",
    expected: job.expected_outputs?.generated_file_paths,
    actual: agentRun.outputs?.generated_files
  });
  checkArrayEqual({
    issues,
    ownerPath,
    field: "outputs.export_paths[]",
    expected: job.expected_outputs?.export_paths,
    actual: agentRun.outputs?.export_paths
  });

  if (job.expected_outputs?.candidate_change_id) {
    const candidatePath = `data/candidate-changes/${job.expected_outputs.candidate_change_id}.json`;
    await checkPathExists({ issues, ownerPath, field: "expected candidate_change", relativePath: candidatePath });

    if (await exists(path.join(workspaceRoot, candidatePath))) {
      const candidate = await readJson(candidatePath);
      checkCandidateReviewLanes({ issues, ownerPath, job, candidate });
      if ((job.quality_gates ?? []).includes("candidate_agent_run_ledger_match")) {
        if (checkCandidateAgentRunLedgerMatch({ issues, ownerPath, candidate, agentRun })) {
          auditSatisfiedQualityGates.add("candidate_agent_run_ledger_match");
        }
      }
    }
  }

  for (const qualityGate of job.quality_gates ?? []) {
    if (auditSatisfiedQualityGates.has(qualityGate)) {
      continue;
    }
    checkQualityGate({ issues, ownerPath, checks, gate: qualityGate });
  }

  if (job.post_run?.export_latest && !hasPassedQualityCheck(checks, "post_export")) {
    issues.push(`${ownerPath}: post_run.export_latest requires passed quality check "post_export".`);
  }
  if (job.post_run?.verify_knowledge_base && !hasPassedQualityCheck(checks, "post_verify")) {
    issues.push(`${ownerPath}: post_run.verify_knowledge_base requires passed quality check "post_verify".`);
  }
}

function checkActiveJobConflicts({ issues, activeJobs }) {
  for (let leftIndex = 0; leftIndex < activeJobs.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < activeJobs.length; rightIndex += 1) {
      const left = activeJobs[leftIndex];
      const right = activeJobs[rightIndex];
      if (left.job.orchestration?.parallel_group !== right.job.orchestration?.parallel_group) {
        continue;
      }

      const leftConflictKeys = new Set(left.job.orchestration?.conflict_keys ?? []);
      const overlappingConflictKeys = (right.job.orchestration?.conflict_keys ?? []).filter((key) => leftConflictKeys.has(key));
      if (overlappingConflictKeys.length === 0) {
        continue;
      }

      if (left.job.orchestration?.reconciliation_required && right.job.orchestration?.reconciliation_required) {
        continue;
      }

      issues.push(
        `${left.ownerPath} and ${right.ownerPath}: active jobs share parallel_group "${left.job.orchestration?.parallel_group}" and conflict key(s) [${stableArrayLabel(overlappingConflictKeys)}] without reconciliation_required on both jobs.`
      );
    }
  }
}

async function main() {
  const issues = [];
  const jobFiles = await walkJsonFiles(jobRoot);
  const recordIndex = await buildRecordIndex();
  let liveJobCount = 0;
  let archivedJobCount = 0;
  const activeJobs = [];

  for (const filePath of jobFiles) {
    const ownerPath = toPosixRelative(filePath);
    const job = JSON.parse(await fs.readFile(filePath, "utf8"));
    if (job.record_type !== "codex_job") {
      issues.push(`${ownerPath}: expected record_type "codex_job".`);
      continue;
    }
    if (ownerPath.startsWith(liveJobPathPrefix)) {
      liveJobCount += 1;
      if (activeJobStatuses.has(job.lifecycle_status)) {
        activeJobs.push({ job, ownerPath });
      }
    }
    if (ownerPath.startsWith(archiveJobPathPrefix)) {
      archivedJobCount += 1;
    }
    await checkCodexJob({ issues, job, ownerPath, recordIndex });
  }

  checkActiveJobConflicts({ issues, activeJobs });

  if (issues.length > 0) {
    console.error(`Codex job audit failed with ${issues.length} issue(s):`);
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log(`Codex job audit passed for ${jobFiles.length} job file(s): ${liveJobCount} live, ${archivedJobCount} archived.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
