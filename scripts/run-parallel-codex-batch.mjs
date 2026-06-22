#!/usr/bin/env node

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const workspaceRoot = process.cwd();
export const defaultPlanPath = "ops/codex-batches/parallel-batch-plan.v1.json";
export const runRoot = "ops/codex-batches/runs";
export const logRoot = "ops/codex-batches/logs";

function usage() {
  console.error(`Usage: npm run jobs:run-batch -- --batch-id <batch-id> [options]

Options:
  --plan <path>            Default: ${defaultPlanPath}
  --sequence <number>      Select batch by sequence instead of --batch-id.
  --execute                Start workers. Without this, print a run preview.
  --max-workers <number>   Maximum worker processes. Default: batch size.
  --run-id <id>            Stable run id. Default: <batch-id>-<timestamp>.
  --base-ref <ref>         Forwarded to agent:codex:worktree.
  --worktree-root <path>   Forwarded to agent:codex:worktree.
  --post-export-verify     Forwarded to agent:codex:worktree.
  --archive-completed      Archive live job specs whose final output exists in this checkout.
`);
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
    plan: defaultPlanPath,
    execute: false,
    archiveCompleted: false,
    postExportVerify: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--plan") {
      options.plan = argv[++index];
    } else if (arg === "--batch-id") {
      options.batchId = argv[++index];
    } else if (arg === "--sequence") {
      options.sequence = parsePositiveInteger(argv[++index], "--sequence");
    } else if (arg === "--execute") {
      options.execute = true;
    } else if (arg === "--max-workers") {
      options.maxWorkers = parsePositiveInteger(argv[++index], "--max-workers");
    } else if (arg === "--run-id") {
      options.runId = argv[++index];
    } else if (arg === "--base-ref") {
      options.baseRef = argv[++index];
    } else if (arg === "--worktree-root") {
      options.worktreeRoot = argv[++index];
    } else if (arg === "--post-export-verify") {
      options.postExportVerify = true;
    } else if (arg === "--archive-completed") {
      options.archiveCompleted = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.batchId && !options.sequence) {
    usage();
    process.exit(2);
  }

  return options;
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "z").toLowerCase();
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");
}

function resolveRepoPath(relativeOrAbsolutePath) {
  return path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(workspaceRoot, relativeOrAbsolutePath);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(resolveRepoPath(relativePath), "utf8"));
}

async function writeJson(relativePath, value) {
  const filePath = resolveRepoPath(relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function updateArchivedAgentRunJobPath(job, archivePath) {
  const outputPath = resolveRepoPath(job.output_path);
  if (!(await exists(outputPath))) {
    return;
  }

  const agentRun = JSON.parse(await fs.readFile(outputPath, "utf8"));
  if (agentRun.record_type !== "agent_run") {
    return;
  }

  agentRun.execution = {
    ...(agentRun.execution ?? {}),
    job_file: archivePath
  };
  await writeJson(job.output_path, agentRun);
}

async function appendLog(logPath, event) {
  await fs.mkdir(path.dirname(resolveRepoPath(logPath)), { recursive: true });
  await fs.appendFile(resolveRepoPath(logPath), `${JSON.stringify(event)}\n`);
}

function selectedBatch(plan, options) {
  const batch = options.batchId
    ? plan.batches.find((item) => item.batch_id === options.batchId)
    : plan.batches.find((item) => item.sequence === options.sequence);

  if (!batch) {
    throw new Error(options.batchId ? `Unknown batch_id: ${options.batchId}` : `Unknown batch sequence: ${options.sequence}`);
  }

  return batch;
}

function commandWithOptions(command, options) {
  const next = [...command];
  if (!options.execute) {
    const executeIndex = next.indexOf("--execute");
    if (executeIndex !== -1) {
      next.splice(executeIndex, 1);
    }
  }
  if (options.baseRef) {
    next.push("--base-ref", options.baseRef);
  }
  if (options.worktreeRoot) {
    next.push("--worktree-root", options.worktreeRoot);
  }
  if (options.postExportVerify) {
    next.push("--post-export-verify");
  }
  return next;
}

function initialRunRecord({ plan, batch, options, startedAt }) {
  const runId = slug(options.runId ?? `${batch.batch_id}-${timestamp()}`);
  const workerStates = batch.job_ids.map((jobId, index) => ({
    job_id: jobId,
    job_path: batch.job_paths[index],
    command: commandWithOptions(batch.commands[index], options),
    status: "planned"
  }));

  return {
    schema_version: "1.0.0",
    record_type: "parallel_batch_run",
    id: runId,
    batch_plan_id: plan.id,
    batch_plan_path: options.plan,
    batch_id: batch.batch_id,
    batch_sequence: batch.sequence,
    parallel_group: batch.parallel_group,
    execution_class: batch.execution_class,
    reconciliation_required: batch.reconciliation_required,
    started_at: startedAt,
    status: options.execute ? "running" : "planned",
    log_path: `${logRoot}/${runId}.jsonl`,
    worker_states: workerStates,
    summary: summarizeWorkers(workerStates),
    next_actions: options.execute ? [] : ["Rerun with --execute to start this batch."]
  };
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
  if (workerStates.every((worker) => worker.status === "succeeded")) {
    actions.push("Run npm run verify:knowledge-base after reviewing resulting candidate changes.");
  }
  return actions;
}

async function maybeArchiveJob(worker, completedAt) {
  const job = await readJson(worker.job_path);
  const outputPath = resolveRepoPath(job.output_path);
  if (!(await exists(outputPath))) {
    worker.status = "succeeded_pending_reconciliation";
    worker.issues = [...(worker.issues ?? []), `${job.output_path} is not present in the coordinator checkout.`];
    return;
  }

  const archivePath = `ops/codex-jobs/archive/${path.basename(worker.job_path)}`;
  if (await exists(resolveRepoPath(archivePath))) {
    worker.status = "succeeded_pending_reconciliation";
    worker.issues = [...(worker.issues ?? []), `${archivePath} already exists.`];
    return;
  }

  const archivedJob = {
    ...job,
    lifecycle_status: "succeeded",
    final_agent_run_id: job.id,
    archived_at: completedAt
  };
  await updateArchivedAgentRunJobPath(job, archivePath);
  await writeJson(archivePath, archivedJob);
  await fs.rm(resolveRepoPath(worker.job_path));
  worker.archive_path = archivePath;
  worker.status = "succeeded";
}

async function finalizeWorker({ worker, exitCode, completedAt, archiveCompleted }) {
  worker.completed_at = completedAt;
  worker.exit_code = exitCode;

  const job = await readJson(worker.job_path);
  worker.output_path = job.output_path;
  worker.worker_log_path = job.jsonl_log_path;

  if (exitCode !== 0) {
    worker.status = "failed";
    worker.issues = [...(worker.issues ?? []), `Worker exited with code ${exitCode}.`];
    return;
  }

  if (archiveCompleted) {
    await maybeArchiveJob(worker, completedAt);
    return;
  }

  worker.status = "succeeded";
}

function parseHelperEvent(line) {
  try {
    const event = JSON.parse(line);
    return event && typeof event === "object" ? event : undefined;
  } catch {
    return undefined;
  }
}

async function runWorker({ worker, runRecordPath, runRecord, archiveCompleted }) {
  worker.status = "running";
  worker.started_at = new Date().toISOString();
  runRecord.summary = summarizeWorkers(runRecord.worker_states);
  await writeJson(runRecordPath, runRecord);
  await appendLog(runRecord.log_path, {
    type: "parallel_batch.worker_started",
    batch_run_id: runRecord.id,
    job_id: worker.job_id,
    started_at: worker.started_at,
    command: worker.command
  });

  const exitCode = await new Promise((resolve) => {
    const child = spawn(worker.command[0], worker.command.slice(1), {
      cwd: workspaceRoot,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const streamBuffers = {
      stdout: "",
      stderr: ""
    };
    const pendingLogWrites = [];
    let settled = false;

    function queueLog(event) {
      const write = appendLog(runRecord.log_path, event).catch((error) => {
        process.stderr.write(`${error.message}\n`);
      });
      pendingLogWrites.push(write);
    }

    function handleLine(streamName, line) {
      if (!line) {
        return;
      }
      const helperEvent = parseHelperEvent(line);
      if (helperEvent?.type === "codex_worktree.prepared" && helperEvent.worktree_path) {
        worker.worktree_path = helperEvent.worktree_path;
      }
      queueLog({
          type: `parallel_batch.worker_${streamName}`,
          batch_run_id: runRecord.id,
          job_id: worker.job_id,
          line
      });
    }

    function handleChunk(streamName, chunk) {
      const text = chunk.toString();
      process[streamName === "stdout" ? "stdout" : "stderr"].write(text);
      const lines = `${streamBuffers[streamName]}${text}`.split("\n");
      streamBuffers[streamName] = lines.pop() ?? "";
      for (const line of lines) {
        handleLine(streamName, line.replace(/\r$/, ""));
      }
    }

    function flushStream(streamName) {
      const line = streamBuffers[streamName].replace(/\r$/, "");
      streamBuffers[streamName] = "";
      handleLine(streamName, line);
    }

    function finish(code) {
      if (settled) {
        return;
      }
      settled = true;
      Promise.allSettled(pendingLogWrites).then(() => resolve(code));
    }

    child.stdout.on("data", (chunk) => handleChunk("stdout", chunk));
    child.stderr.on("data", (chunk) => handleChunk("stderr", chunk));
    child.on("error", (error) => {
      worker.issues = [...(worker.issues ?? []), error.message];
      finish(1);
    });
    child.on("close", (code, signal) => {
      flushStream("stdout");
      flushStream("stderr");
      if (signal) {
        worker.issues = [...(worker.issues ?? []), `Worker exited after signal ${signal}.`];
      }
      finish(code ?? 1);
    });
  });

  const completedAt = new Date().toISOString();
  await finalizeWorker({ worker, exitCode, completedAt, archiveCompleted });
  runRecord.summary = summarizeWorkers(runRecord.worker_states);
  await writeJson(runRecordPath, runRecord);
  await appendLog(runRecord.log_path, {
    type: "parallel_batch.worker_completed",
    batch_run_id: runRecord.id,
    job_id: worker.job_id,
    completed_at: completedAt,
    status: worker.status,
    exit_code: worker.exit_code,
    worktree_path: worker.worktree_path,
    archive_path: worker.archive_path,
    issues: worker.issues ?? []
  });
}

async function runWorkers({ runRecord, runRecordPath, maxWorkers, archiveCompleted }) {
  const queue = [...runRecord.worker_states];
  const active = new Set();

  async function startNext() {
    if (queue.length === 0) {
      return;
    }
    const worker = queue.shift();
    const promise = runWorker({ worker, runRecordPath, runRecord, archiveCompleted })
      .finally(() => {
        active.delete(promise);
      });
    active.add(promise);
  }

  while (queue.length > 0 || active.size > 0) {
    while (queue.length > 0 && active.size < maxWorkers) {
      await startNext();
    }
    if (active.size > 0) {
      await Promise.race(active);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const plan = await readJson(options.plan);
  if (plan.record_type !== "parallel_batch_plan") {
    throw new Error(`${options.plan}: expected record_type "parallel_batch_plan".`);
  }
  const batch = selectedBatch(plan, options);
  const startedAt = new Date().toISOString();
  const runRecord = initialRunRecord({ plan, batch, options, startedAt });
  runRecord.summary = summarizeWorkers(runRecord.worker_states);
  const runRecordPath = `${runRoot}/${runRecord.id}.json`;

  if (!options.execute) {
    console.log(JSON.stringify(runRecord, null, 2));
    return;
  }

  await writeJson(runRecordPath, runRecord);
  await appendLog(runRecord.log_path, {
    type: "parallel_batch.run_started",
    batch_run_id: runRecord.id,
    batch_id: runRecord.batch_id,
    started_at: runRecord.started_at
  });

  const maxWorkers = Math.min(options.maxWorkers ?? runRecord.worker_states.length, runRecord.worker_states.length);
  await runWorkers({ runRecord, runRecordPath, maxWorkers, archiveCompleted: options.archiveCompleted });

  runRecord.completed_at = new Date().toISOString();
  runRecord.status = summarizeRunStatus(runRecord.worker_states);
  runRecord.summary = summarizeWorkers(runRecord.worker_states);
  runRecord.next_actions = nextActionsForRun(runRecord.worker_states);
  await writeJson(runRecordPath, runRecord);
  await appendLog(runRecord.log_path, {
    type: "parallel_batch.run_completed",
    batch_run_id: runRecord.id,
    completed_at: runRecord.completed_at,
    status: runRecord.status,
    summary: runRecord.summary
  });

  console.log(`Wrote ${runRecordPath}.`);
  if (runRecord.worker_states.some((worker) => worker.status === "failed")) {
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
