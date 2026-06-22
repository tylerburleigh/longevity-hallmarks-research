#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const livePrefix = "ops/codex-jobs/live/";
const archivePrefix = "ops/codex-jobs/archive/";
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

  console.log(JSON.stringify({ type: "codex_job.archived", ...plan }));
}

archiveJob(parseArgs(process.argv.slice(2))).catch((error) => {
  console.error(error);
  process.exit(1);
});
