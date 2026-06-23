#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const contractPath = "tests/fixtures/orchestration-smoke-output-contract.json";

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

function archivePathForJobFile(jobFile) {
  return jobFile.replace(/^ops\/codex-jobs\/live\//, "ops/codex-jobs/archive/");
}

async function resolveContractJobFile(contract) {
  if (await exists(contract.job_file)) {
    return contract.job_file;
  }

  const archivePath = archivePathForJobFile(contract.job_file);
  if (archivePath !== contract.job_file && (await exists(archivePath))) {
    return archivePath;
  }

  return contract.job_file;
}

function stableJson(value) {
  return JSON.stringify(value, null, 2);
}

function sortedArray(value) {
  return [...(value ?? [])].sort((left, right) => left.localeCompare(right));
}

function compactProposedRecords(records) {
  return (records ?? []).map((record) => ({
    record_type: record.record_type,
    record_id: record.record_id,
    path: record.path,
    change_type: record.change_type
  }));
}

function addIssue(issues, message) {
  issues.push(message);
}

function checkEqual({ issues, field, expected, actual }) {
  if (stableJson(expected) !== stableJson(actual)) {
    addIssue(issues, `${field}: expected ${stableJson(expected)}, found ${stableJson(actual)}.`);
  }
}

function checkArrayEqual({ issues, field, expected, actual }) {
  checkEqual({ issues, field, expected: sortedArray(expected), actual: sortedArray(actual) });
}

async function checkPathExists({ issues, field, relativePath }) {
  if (!(await exists(relativePath))) {
    addIssue(issues, `${field}: path does not exist: ${relativePath}.`);
  }
}

function pathWriteKey(relativePath) {
  return `path:${relativePath}`;
}

function checkJobAgainstContract({ issues, contract, job }) {
  const candidate = contract.candidate_change;

  checkEqual({ issues, field: "job.id", expected: contract.id, actual: job.id });
  checkEqual({ issues, field: "job.prompt_file", expected: contract.prompt_template_file, actual: job.prompt_file });
  checkEqual({ issues, field: "job.output_path", expected: contract.agent_run_output_path, actual: job.output_path });
  checkEqual({ issues, field: "job.jsonl_log_path", expected: contract.jsonl_log_path, actual: job.jsonl_log_path });
  checkEqual({ issues, field: "job.agent_role", expected: contract.agent_run.agent_role, actual: job.agent_role });
  checkEqual({ issues, field: "job.mode", expected: contract.agent_run.mode, actual: job.mode });
  checkEqual({
    issues,
    field: "job.expected_outputs.canonical_write_policy",
    expected: contract.agent_run.canonical_write_policy,
    actual: job.expected_outputs?.canonical_write_policy
  });
  checkEqual({
    issues,
    field: "job.expected_outputs.candidate_change_id",
    expected: candidate.id,
    actual: job.expected_outputs?.candidate_change_id
  });
  checkArrayEqual({
    issues,
    field: "job.expected_outputs.required_review_lanes",
    expected: candidate.required_review_lanes,
    actual: job.expected_outputs?.required_review_lanes
  });
  checkArrayEqual({
    issues,
    field: "job.expected_outputs.proposed_record_paths",
    expected: [candidate.path],
    actual: job.expected_outputs?.proposed_record_paths
  });
  checkArrayEqual({
    issues,
    field: "job.quality_gates",
    expected: contract.quality_gates,
    actual: job.quality_gates
  });
  checkEqual({ issues, field: "job.post_run", expected: contract.post_run, actual: job.post_run });

  const writeSets = job.orchestration?.write_sets ?? [];
  for (const canonicalPath of contract.allowed_canonical_paths ?? []) {
    if (!writeSets.includes(pathWriteKey(canonicalPath))) {
      addIssue(issues, `job.orchestration.write_sets: missing allowed path key ${pathWriteKey(canonicalPath)}.`);
    }
  }

  const proposedPaths = job.expected_outputs?.proposed_record_paths ?? [];
  const writtenPaths = writeSets
    .filter((key) => key.startsWith("path:"))
    .map((key) => key.slice("path:".length));
  for (const prefix of contract.forbidden_canonical_prefixes ?? []) {
    const badProposedPath = proposedPaths.find((candidatePath) => candidatePath.startsWith(prefix));
    if (badProposedPath) {
      addIssue(issues, `job.expected_outputs.proposed_record_paths: forbidden smoke path ${badProposedPath}.`);
    }
    const badWritePath = writtenPaths.find((candidatePath) => candidatePath.startsWith(prefix));
    if (badWritePath) {
      addIssue(issues, `job.orchestration.write_sets: forbidden smoke path ${badWritePath}.`);
    }
  }
}

async function checkCandidateIfPresent({ issues, contract }) {
  const candidateContract = contract.candidate_change;
  if (!(await exists(candidateContract.path))) {
    return;
  }

  const candidate = await readJson(candidateContract.path);
  checkEqual({ issues, field: "candidate.record_type", expected: "candidate_change", actual: candidate.record_type });
  checkEqual({ issues, field: "candidate.id", expected: candidateContract.id, actual: candidate.id });
  checkEqual({
    issues,
    field: "candidate.lifecycle_status",
    expected: candidateContract.lifecycle_status,
    actual: candidate.lifecycle_status
  });
  checkArrayEqual({
    issues,
    field: "candidate.required_review_lanes",
    expected: candidateContract.required_review_lanes,
    actual: candidate.required_review_lanes
  });
  checkEqual({
    issues,
    field: "candidate.proposed_records",
    expected: compactProposedRecords(candidateContract.proposed_records),
    actual: compactProposedRecords(candidate.proposed_records)
  });
}

async function checkAgentRunIfPresent({ issues, contract }) {
  if (!(await exists(contract.agent_run_output_path))) {
    return;
  }

  const agentRun = await readJson(contract.agent_run_output_path);
  const candidate = contract.candidate_change;
  checkEqual({ issues, field: "agent_run.id", expected: contract.id, actual: agentRun.id });
  checkEqual({ issues, field: "agent_run.agent_role", expected: contract.agent_run.agent_role, actual: agentRun.agent_role });
  checkEqual({ issues, field: "agent_run.mode", expected: contract.agent_run.mode, actual: agentRun.mode });
  checkEqual({
    issues,
    field: "agent_run.canonical_write_policy",
    expected: contract.agent_run.canonical_write_policy,
    actual: agentRun.canonical_write_policy
  });
  checkEqual({
    issues,
    field: "agent_run.outputs.candidate_change_id",
    expected: candidate.id,
    actual: agentRun.outputs?.candidate_change_id
  });
  checkArrayEqual({
    issues,
    field: "agent_run.outputs.proposed_records[].path",
    expected: [candidate.path],
    actual: (agentRun.outputs?.proposed_records ?? []).map((record) => record.path)
  });
}

async function main() {
  const issues = [];
  const contract = await readJson(contractPath);
  const resolvedJobFile = await resolveContractJobFile(contract);

  await checkPathExists({ issues, field: "contract.job_file", relativePath: resolvedJobFile });
  await checkPathExists({ issues, field: "contract.prompt_template_file", relativePath: contract.prompt_template_file });
  if (issues.length > 0) {
    console.error(`Orchestration smoke contract audit failed with ${issues.length} issue(s):`);
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  const job = await readJson(resolvedJobFile);
  checkJobAgainstContract({ issues, contract, job });
  await checkCandidateIfPresent({ issues, contract });
  await checkAgentRunIfPresent({ issues, contract });

  if (issues.length > 0) {
    console.error(`Orchestration smoke contract audit failed with ${issues.length} issue(s):`);
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log(`Orchestration smoke contract audit passed for ${contract.id}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
