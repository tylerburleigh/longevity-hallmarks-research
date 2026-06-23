#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const livePrefix = "ops/codex-jobs/live/";
const archivePrefix = "ops/codex-jobs/archive/";
const batchRunRoot = "ops/codex-batches/runs";
const finalStatuses = new Set(["succeeded", "failed", "archived"]);

function usage() {
  console.error(`Usage:
  npm run jobs:archive -- --job-file <path> [options]

Options:
  --status <status>     succeeded | failed | archived. Default: succeeded.
  --archived-at <iso>   Default: current time.
  --dry-run             Print the archive plan without writing files.
`);
}

function parseArgs(argv) {
  const options = {
    status: "succeeded",
    archivedAt: new Date().toISOString(),
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--job-file") {
      options.jobFile = argv[++index];
    } else if (arg === "--status") {
      options.status = argv[++index];
    } else if (arg === "--archived-at") {
      options.archivedAt = argv[++index];
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.jobFile) {
    usage();
    process.exit(2);
  }

  if (!finalStatuses.has(options.status)) {
    throw new Error(`Unsupported archive status: ${options.status}`);
  }

  return options;
}

function resolveRepoPath(relativeOrAbsolutePath) {
  return path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(workspaceRoot, relativeOrAbsolutePath);
}

function toPosixRelative(filePath) {
  return path.relative(workspaceRoot, filePath).split(path.sep).join("/");
}

async function exists(relativeOrAbsolutePath) {
  try {
    await fs.access(resolveRepoPath(relativeOrAbsolutePath));
    return true;
  } catch {
    return false;
  }
}

async function readJson(relativeOrAbsolutePath) {
  return JSON.parse(await fs.readFile(resolveRepoPath(relativeOrAbsolutePath), "utf8"));
}

async function walkJsonFiles(rootPath) {
  if (!(await exists(rootPath))) {
    return [];
  }

  const entries = await fs.readdir(resolveRepoPath(rootPath), { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkJsonFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(entryPath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

async function writeJson(relativeOrAbsolutePath, value) {
  const filePath = resolveRepoPath(relativeOrAbsolutePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function archivePathForJob(jobFile) {
  return `${archivePrefix}${path.basename(jobFile)}`;
}

function assertLiveJobPath(jobFile) {
  const relativePath = toPosixRelative(resolveRepoPath(jobFile));
  if (!relativePath.startsWith(livePrefix)) {
    throw new Error(`job-file must be a live Codex job under ${livePrefix}: ${jobFile}`);
  }
  return relativePath;
}

async function updateAgentRunJobFile({ outputPath, archivePath }) {
  const agentRun = await readJson(outputPath);
  if (agentRun.record_type !== "agent_run") {
    throw new Error(`${outputPath}: expected record_type "agent_run".`);
  }

  agentRun.execution = {
    ...(agentRun.execution ?? {}),
    job_file: archivePath
  };
  await writeJson(outputPath, agentRun);
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

function nextActionsForRun(workerStates) {
  const actions = [];
  if (workerStates.some((worker) => worker.status === "succeeded_pending_reconciliation")) {
    actions.push("Reconcile successful worker worktrees into the coordinator checkout, then rerun audits and archive completed job specs.");
  }
  if (workerStates.some((worker) => worker.status === "failed")) {
    actions.push("Inspect batch log events and failed worker logs before rerunning failed jobs.");
  }
  if (actions.length === 0 && workerStates.every((worker) => worker.status === "succeeded")) {
    actions.push("Run npm run verify:knowledge-base after reviewing resulting candidate changes.");
  }
  return actions;
}

async function updateBatchRunsForArchivedJob({ jobFile, archivePath, outputPath }) {
  const updatedRunPaths = [];
  const runFiles = await walkJsonFiles(batchRunRoot);

  for (const runPath of runFiles) {
    const run = await readJson(runPath);
    if (run.record_type !== "parallel_batch_run") {
      continue;
    }

    let changed = false;
    for (const worker of run.worker_states ?? []) {
      if (worker.job_path !== jobFile) {
        continue;
      }

      worker.archive_path = archivePath;
      worker.output_path = outputPath;
      if (worker.status === "succeeded_pending_reconciliation" || worker.status === "succeeded") {
        worker.status = "succeeded";
      }
      if (worker.issues) {
        worker.issues = worker.issues.filter((issue) => !issue.includes(`${outputPath} is not present in the coordinator checkout.`));
        if (worker.issues.length === 0) {
          delete worker.issues;
        }
      }
      changed = true;
    }

    if (!changed) {
      continue;
    }

    run.status = summarizeRunStatus(run.worker_states ?? []);
    run.summary = summarizeWorkers(run.worker_states ?? []);
    run.next_actions = nextActionsForRun(run.worker_states ?? []);
    await writeJson(runPath, run);
    updatedRunPaths.push(runPath);
  }

  return updatedRunPaths;
}

async function buildArchivePlan(options) {
  const jobFile = assertLiveJobPath(options.jobFile);
  const job = await readJson(jobFile);
  if (job.record_type !== "codex_job") {
    throw new Error(`${jobFile}: expected record_type "codex_job".`);
  }

  const archivePath = archivePathForJob(jobFile);
  if (await exists(archivePath)) {
    throw new Error(`${archivePath} already exists.`);
  }
  if (!(await exists(job.output_path))) {
    throw new Error(`${job.output_path} does not exist; archive only after the final agent_run is present.`);
  }

  return {
    schema_version: "1.0.0",
    job_id: job.id,
    job_file: jobFile,
    archive_path: archivePath,
    output_path: job.output_path,
    status: options.status,
    archived_at: options.archivedAt,
    dry_run: options.dryRun
  };
}

async function archiveJob(options) {
  const plan = await buildArchivePlan(options);
  if (options.dryRun) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  const job = await readJson(plan.job_file);
  await updateAgentRunJobFile({ outputPath: plan.output_path, archivePath: plan.archive_path });
  await writeJson(plan.archive_path, {
    ...job,
    lifecycle_status: plan.status,
    final_agent_run_id: job.id,
    archived_at: plan.archived_at
  });
  await fs.rm(resolveRepoPath(plan.job_file));
  const updatedBatchRunPaths = await updateBatchRunsForArchivedJob({
    jobFile: plan.job_file,
    archivePath: plan.archive_path,
    outputPath: plan.output_path
  });

  console.log(JSON.stringify({ type: "codex_job.archived", ...plan, updated_batch_run_paths: updatedBatchRunPaths }));
}

archiveJob(parseArgs(process.argv.slice(2))).catch((error) => {
  console.error(error);
  process.exit(1);
});
