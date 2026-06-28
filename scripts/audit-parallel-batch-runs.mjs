#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const runRoot = "ops/codex-batches/runs";

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

function summarizeWorkers(workerStates) {
  return {
    planned_count: workerStates.filter((worker) => worker.status === "planned").length,
    running_count: workerStates.filter((worker) => worker.status === "running").length,
    succeeded_count: workerStates.filter((worker) => worker.status === "succeeded").length,
    pending_reconciliation_count: workerStates.filter((worker) => worker.status === "succeeded_pending_reconciliation").length,
    failed_count: workerStates.filter((worker) => worker.status === "failed").length,
    archived_count: workerStates.filter((worker) => worker.archive_path).length
  };
}

function summarizeRunStatus(workerStates) {
  if (workerStates.some((worker) => worker.status === "running")) {
    return "running";
  }
  if (workerStates.some((worker) => worker.status === "failed")) {
    return workerStates.some((worker) => worker.status === "succeeded" || worker.status === "succeeded_pending_reconciliation")
      ? "partial"
      : "failed";
  }
  if (workerStates.some((worker) => worker.status === "succeeded_pending_reconciliation")) {
    return "partial";
  }
  return "succeeded";
}

function checkEqual({ issues, ownerPath, field, expected, actual }) {
  if (expected !== actual) {
    issues.push(`${ownerPath}: expected ${field} ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}.`);
  }
}

async function main() {
  const issues = [];
  const runFiles = await walkJsonFiles(path.join(workspaceRoot, runRoot));

  for (const filePath of runFiles) {
    const relativePath = toPosixRelative(filePath);
    const run = await readJson(relativePath);
    if (run.record_type !== "parallel_batch_run") {
      issues.push(`${relativePath}: expected record_type "parallel_batch_run".`);
      continue;
    }

    if (!(await exists(path.join(workspaceRoot, run.batch_plan_path)))) {
      issues.push(`${relativePath}: batch_plan_path does not exist: ${run.batch_plan_path}.`);
    }
    if (!(await exists(path.join(workspaceRoot, run.log_path)))) {
      issues.push(`${relativePath}: log_path does not exist: ${run.log_path}.`);
    }

    const expectedStatus = summarizeRunStatus(run.worker_states ?? []);
    checkEqual({ issues, ownerPath: relativePath, field: "status", expected: expectedStatus, actual: run.status });

    const expectedSummary = summarizeWorkers(run.worker_states ?? []);
    for (const [field, expectedValue] of Object.entries(expectedSummary)) {
      checkEqual({
        issues,
        ownerPath: relativePath,
        field: `summary.${field}`,
        expected: expectedValue,
        actual: run.summary?.[field]
      });
    }

    for (const worker of run.worker_states ?? []) {
      const jobPathExists = await exists(path.join(workspaceRoot, worker.job_path));
      const archivePathExists = worker.archive_path
        ? await exists(path.join(workspaceRoot, worker.archive_path))
        : false;
      const outputPathExists = worker.output_path
        ? await exists(path.join(workspaceRoot, worker.output_path))
        : false;
      if (!jobPathExists && !archivePathExists) {
        issues.push(`${relativePath}: worker ${worker.job_id} has neither live job_path nor archive_path.`);
      }
      if (worker.status === "succeeded" && worker.archive_path && !archivePathExists) {
        issues.push(`${relativePath}: worker ${worker.job_id} archive_path does not exist: ${worker.archive_path}.`);
      }
      if (worker.status === "succeeded" && !outputPathExists) {
        issues.push(`${relativePath}: succeeded worker ${worker.job_id} output_path does not exist: ${worker.output_path}.`);
      }
      if (worker.status === "running" && worker.archive_path) {
        issues.push(`${relativePath}: worker ${worker.job_id} is running but has archive_path; archived workers must use a terminal status.`);
      }
      if (worker.status === "running" && worker.output_path && outputPathExists) {
        issues.push(`${relativePath}: worker ${worker.job_id} is running but output_path exists; completed workers must use a terminal status.`);
      }
      if (worker.status === "succeeded_pending_reconciliation") {
        if ((worker.issues ?? []).length === 0) {
          issues.push(`${relativePath}: pending-reconciliation worker ${worker.job_id} should include issues[].`);
        }
        if (outputPathExists && worker.issues?.some((issue) => issue.includes("is not present in the coordinator checkout"))) {
          issues.push(`${relativePath}: worker ${worker.job_id} is succeeded_pending_reconciliation but output_path exists: ${worker.output_path}.`);
        }
      }
      if (worker.status === "failed" && (worker.issues ?? []).length === 0) {
        issues.push(`${relativePath}: failed worker ${worker.job_id} should include issues[].`);
      }
    }
  }

  if (issues.length > 0) {
    console.error(`Parallel-batch run audit failed with ${issues.length} issue(s):`);
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log(`Parallel-batch run audit passed for ${runFiles.length} run record(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
