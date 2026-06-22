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

    for (const worker of run.worker_states ?? []) {
      const jobPathExists = await exists(path.join(workspaceRoot, worker.job_path));
      const archivePathExists = worker.archive_path
        ? await exists(path.join(workspaceRoot, worker.archive_path))
        : false;
      if (!jobPathExists && !archivePathExists) {
        issues.push(`${relativePath}: worker ${worker.job_id} has neither live job_path nor archive_path.`);
      }
      if (worker.status === "succeeded" && worker.archive_path && !archivePathExists) {
        issues.push(`${relativePath}: worker ${worker.job_id} archive_path does not exist: ${worker.archive_path}.`);
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
