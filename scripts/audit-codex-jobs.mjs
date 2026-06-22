#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const jobRoot = path.join(workspaceRoot, "ops", "codex-jobs");
const liveJobPathPrefix = "ops/codex-jobs/live/";
const archiveJobPathPrefix = "ops/codex-jobs/archive/";
const activeJobStatuses = new Set(["planned", "ready", "running"]);
const finalJobStatuses = new Set(["succeeded", "failed", "superseded", "archived"]);
const aggregateQualityGateChecks = {
  audit_exports: new Set(["verify_knowledge_base", "post_verify"]),
  audit_triage_state: new Set(["verify_knowledge_base", "post_verify"]),
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

function qualityChecksByName(agentRun) {
  const checks = new Map();
  for (const check of agentRun.quality_checks ?? []) {
    checks.set(check.check_name, check);
  }
  return checks;
}

function hasPassedQualityCheck(checks, checkName) {
  return checks.get(checkName)?.status === "passed";
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
    return;
  }

  for (const [index, candidatePath] of candidatePaths.entries()) {
    if (agentRunPaths[index] !== candidatePath) {
      issues.push(
        `${ownerPath}: candidate_agent_run_ledger_match expected candidate paths [${stableArrayLabel(candidatePaths)}], found agent-run paths [${stableArrayLabel(agentRunPaths)}].`
      );
      return;
    }
  }
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

async function checkCodexJob({ issues, job, ownerPath }) {
  await checkPathExists({ issues, ownerPath, field: "prompt_file", relativePath: job.prompt_file });
  await checkPathExists({ issues, ownerPath, field: "execution.output_schema_path", relativePath: job.execution?.output_schema_path });
  const outputExists = await exists(path.join(workspaceRoot, job.output_path));

  checkJobLifecycle({ issues, job, ownerPath, outputExists });

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
      checkArrayEqual({
        issues,
        ownerPath,
        field: "candidate_change.required_review_lanes[]",
        expected: job.expected_outputs.required_review_lanes,
        actual: candidate.required_review_lanes
      });
      if ((job.quality_gates ?? []).includes("candidate_agent_run_ledger_match")) {
        checkCandidateAgentRunLedgerMatch({ issues, ownerPath, candidate, agentRun });
      }
    }
  }

  for (const qualityGate of job.quality_gates ?? []) {
    checkQualityGate({ issues, ownerPath, checks, gate: qualityGate });
  }

  if (job.post_run?.export_latest && !hasPassedQualityCheck(checks, "post_export")) {
    issues.push(`${ownerPath}: post_run.export_latest requires passed quality check "post_export".`);
  }
  if (job.post_run?.verify_knowledge_base && !hasPassedQualityCheck(checks, "post_verify")) {
    issues.push(`${ownerPath}: post_run.verify_knowledge_base requires passed quality check "post_verify".`);
  }
}

async function main() {
  const issues = [];
  const jobFiles = await walkJsonFiles(jobRoot);
  let liveJobCount = 0;
  let archivedJobCount = 0;

  for (const filePath of jobFiles) {
    const ownerPath = toPosixRelative(filePath);
    const job = JSON.parse(await fs.readFile(filePath, "utf8"));
    if (job.record_type !== "codex_job") {
      issues.push(`${ownerPath}: expected record_type "codex_job".`);
      continue;
    }
    if (ownerPath.startsWith(liveJobPathPrefix)) {
      liveJobCount += 1;
    }
    if (ownerPath.startsWith(archiveJobPathPrefix)) {
      archivedJobCount += 1;
    }
    await checkCodexJob({ issues, job, ownerPath });
  }

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
