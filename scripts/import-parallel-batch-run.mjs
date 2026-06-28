#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const runRoot = "ops/codex-batches/runs";
const archivePrefix = "ops/codex-jobs/archive/";

function usage() {
  console.error(`Usage:
  npm run jobs:import-batch -- --run <run-id-or-path> [options]

Options:
  --dry-run          Print planned imports without copying, archiving, or refreshing.
  --overwrite        Allow replacing existing coordinator files when content differs.
  --allow-conflicting-overwrite
                     With --overwrite, allow last-worker-wins copying when multiple
                     workers produced different content for the same artifact path.
  --skip-archive     Copy artifacts but leave live job specs and batch states unchanged.
  --skip-refresh     Skip generated-state refresh commands after import.
  --verify           Run npm run verify:knowledge-base after refresh.
`);
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    overwrite: false,
    allowConflictingOverwrite: false,
    archive: true,
    refresh: true,
    verify: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--run") {
      options.run = argv[++index];
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--overwrite") {
      options.overwrite = true;
    } else if (arg === "--allow-conflicting-overwrite") {
      options.allowConflictingOverwrite = true;
    } else if (arg === "--skip-archive") {
      options.archive = false;
    } else if (arg === "--skip-refresh") {
      options.refresh = false;
    } else if (arg === "--verify") {
      options.verify = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.run) {
    usage();
    process.exit(2);
  }

  return options;
}

function resolveRepoPath(relativeOrAbsolutePath) {
  return path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(workspaceRoot, relativeOrAbsolutePath);
}

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

async function exists(relativeOrAbsolutePath) {
  try {
    await fs.access(resolveRepoPath(relativeOrAbsolutePath));
    return true;
  } catch {
    return false;
  }
}

async function readFileIfExists(relativeOrAbsolutePath) {
  const filePath = resolveRepoPath(relativeOrAbsolutePath);
  try {
    return await fs.readFile(filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function readJson(relativeOrAbsolutePath) {
  return JSON.parse(await fs.readFile(resolveRepoPath(relativeOrAbsolutePath), "utf8"));
}

async function writeJson(relativeOrAbsolutePath, value) {
  const filePath = resolveRepoPath(relativeOrAbsolutePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function runPathFor(value) {
  if (value.endsWith(".json") || value.includes("/")) {
    return value;
  }
  return `${runRoot}/${value}.json`;
}

function archivePathForJob(jobPath) {
  return `${archivePrefix}${path.basename(jobPath)}`;
}

function commandLogPathFor(jsonlLogPath) {
  if (!jsonlLogPath?.endsWith(".jsonl")) {
    return undefined;
  }
  return jsonlLogPath.replace(/\.jsonl$/, ".command.jsonl");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function detectSharedArtifactConflicts(workers) {
  const artifactsByPath = new Map();

  for (const worker of workers) {
    const job = await readJson(worker.job_path);
    const agentRun = await loadAgentRunFromWorktree({ worktreePath: worker.worktree_path, outputPath: job.output_path });
    for (const artifactPath of declaredArtifactPaths({ job, agentRun })) {
      const sourcePath = path.join(worker.worktree_path, artifactPath);
      const sourceBytes = await readFileIfExists(sourcePath);
      if (!sourceBytes) {
        continue;
      }
      const entries = artifactsByPath.get(artifactPath) ?? [];
      entries.push({
        job_id: worker.job_id,
        hash: sha256(sourceBytes)
      });
      artifactsByPath.set(artifactPath, entries);
    }
  }

  return [...artifactsByPath.entries()]
    .map(([artifactPath, entries]) => ({
      artifactPath,
      entries,
      hashes: [...new Set(entries.map((entry) => entry.hash))]
    }))
    .filter((entry) => entry.entries.length > 1 && entry.hashes.length > 1);
}

async function copyFileFromWorktree({ worktreePath, relativePath, overwrite, dryRun }) {
  const sourcePath = path.join(worktreePath, relativePath);
  const destinationPath = resolveRepoPath(relativePath);
  const sourceBytes = await readFileIfExists(sourcePath);
  if (!sourceBytes) {
    throw new Error(`${relativePath} is not present in worker worktree ${worktreePath}.`);
  }

  const destinationBytes = await readFileIfExists(destinationPath);
  if (destinationBytes) {
    if (Buffer.compare(sourceBytes, destinationBytes) === 0) {
      return { path: relativePath, status: "unchanged" };
    }
    if (!overwrite) {
      throw new Error(`${relativePath} already exists in coordinator checkout with different content; rerun with --overwrite if intended.`);
    }
  }

  if (!dryRun) {
    await fs.mkdir(path.dirname(destinationPath), { recursive: true });
    await fs.copyFile(sourcePath, destinationPath);
  }

  return { path: relativePath, status: destinationBytes ? "overwritten" : "copied" };
}

async function loadAgentRunFromWorktree({ worktreePath, outputPath }) {
  const agentRun = JSON.parse(await fs.readFile(path.join(worktreePath, outputPath), "utf8"));
  if (agentRun.record_type !== "agent_run") {
    throw new Error(`${outputPath}: expected record_type "agent_run" in worker worktree.`);
  }
  return agentRun;
}

function declaredArtifactPaths({ job, agentRun }) {
  const proposedRecordPaths = (agentRun.outputs?.proposed_records ?? [])
    .map((record) => record?.path);

  return unique([
    job.output_path,
    job.jsonl_log_path,
    commandLogPathFor(job.jsonl_log_path),
    agentRun.execution?.prompt_file,
    agentRun.execution?.jsonl_log_path,
    commandLogPathFor(agentRun.execution?.jsonl_log_path),
    ...(agentRun.outputs?.generated_files ?? []),
    ...proposedRecordPaths,
    ...(agentRun.outputs?.export_paths ?? [])
  ]);
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

async function archiveWorker({ run, worker, job, archivedAt, dryRun }) {
  const archivePath = archivePathForJob(worker.job_path);
  if (await exists(archivePath)) {
    throw new Error(`${archivePath} already exists.`);
  }
  if (!dryRun && !(await exists(job.output_path))) {
    throw new Error(`${job.output_path} does not exist in coordinator checkout after import.`);
  }

  if (!dryRun) {
    await updateAgentRunJobFile({ outputPath: job.output_path, archivePath });
    await writeJson(archivePath, {
      ...job,
      lifecycle_status: "succeeded",
      final_agent_run_id: job.id,
      archived_at: archivedAt
    });
    await fs.rm(resolveRepoPath(worker.job_path));
  }

  worker.archive_path = archivePath;
  worker.output_path = job.output_path;
  worker.worker_log_path = job.jsonl_log_path;
  worker.status = "succeeded";
  if (worker.issues) {
    worker.issues = worker.issues.filter((issue) => !issue.includes(`${job.output_path} is not present in the coordinator checkout.`));
    if (worker.issues.length === 0) {
      delete worker.issues;
    }
  }
  run.status = summarizeRunStatus(run.worker_states ?? []);
  run.summary = summarizeWorkers(run.worker_states ?? []);
  run.next_actions = nextActionsForRun(run.worker_states ?? []);
}

function runCommand(command) {
  const result = spawnSync(command[0], command.slice(1), {
    cwd: workspaceRoot,
    encoding: "utf8",
    stdio: "inherit"
  });
  if (result.status !== 0) {
    throw new Error(`${command.join(" ")} exited ${result.status}.`);
  }
}

function refreshCommands({ verify }) {
  const commands = [
    ["npm", "run", "export:triage-state"],
    ["npm", "run", "export:release-readiness"],
    ["npm", "run", "jobs:self-healing", "--", "--all", "--replace"],
    ["npm", "run", "jobs:plan-parallel"],
    ["npm", "run", "reconcile:parallel"],
    ["npm", "run", "export:read-model"],
    ["npm", "run", "export:latest"],
    ["npm", "run", "metrics:orchestration"]
  ];
  if (verify) {
    commands.push(["npm", "run", "verify:knowledge-base"]);
  }
  return commands;
}

async function importBatchRun(options) {
  const runPath = runPathFor(options.run);
  const run = await readJson(runPath);
  if (run.record_type !== "parallel_batch_run") {
    throw new Error(`${runPath}: expected record_type "parallel_batch_run".`);
  }

  const workers = (run.worker_states ?? []).filter((worker) => worker.status === "succeeded_pending_reconciliation");
  const imported = [];

  if (options.overwrite && !options.allowConflictingOverwrite) {
    const sharedArtifactConflicts = await detectSharedArtifactConflicts(workers);
    if (sharedArtifactConflicts.length > 0) {
      const details = sharedArtifactConflicts
        .map((conflict) => {
          const jobs = conflict.entries.map((entry) => `${entry.job_id}:${entry.hash.slice(0, 12)}`).join(", ");
          return `- ${conflict.artifactPath}: ${jobs}`;
        })
        .join("\n");
      throw new Error(
        `Multiple workers produced different content for the same artifact path. Reconcile manually or rerun with --allow-conflicting-overwrite if last-worker-wins copying is intended.\n${details}`
      );
    }
  }

  for (const worker of workers) {
    if (!worker.worktree_path) {
      throw new Error(`worker ${worker.job_id}: missing worktree_path.`);
    }
    if (!(await exists(worker.worktree_path))) {
      throw new Error(`worker ${worker.job_id}: worktree_path does not exist: ${worker.worktree_path}`);
    }

    const job = await readJson(worker.job_path);
    const agentRun = await loadAgentRunFromWorktree({ worktreePath: worker.worktree_path, outputPath: job.output_path });
    const artifactPaths = declaredArtifactPaths({ job, agentRun });
    const copied = [];
    for (const artifactPath of artifactPaths) {
      copied.push(await copyFileFromWorktree({
        worktreePath: worker.worktree_path,
        relativePath: artifactPath,
        overwrite: options.overwrite,
        dryRun: options.dryRun
      }));
    }

    if (!options.dryRun) {
      runCommand(["npm", "run", "validate:records"]);
    }

    if (options.archive) {
      await archiveWorker({
        run,
        worker,
        job,
        archivedAt: new Date().toISOString(),
        dryRun: options.dryRun
      });
    }

    imported.push({
      job_id: worker.job_id,
      worktree_path: worker.worktree_path,
      artifact_count: copied.length,
      artifacts: copied,
      archive_path: worker.archive_path
    });
  }

  if (!options.dryRun) {
    run.status = summarizeRunStatus(run.worker_states ?? []);
    run.summary = summarizeWorkers(run.worker_states ?? []);
    run.next_actions = nextActionsForRun(run.worker_states ?? []);
    await writeJson(runPath, run);
  }

  if (options.refresh && !options.dryRun && imported.length > 0) {
    for (const command of refreshCommands({ verify: options.verify })) {
      runCommand(command);
    }
  }

  console.log(JSON.stringify({
    type: "parallel_batch.imported",
    run_path: runPath,
    dry_run: options.dryRun,
    imported_worker_count: imported.length,
    imported
  }, null, 2));
}

importBatchRun(parseArgs(process.argv.slice(2))).catch((error) => {
  console.error(error);
  process.exit(1);
});
