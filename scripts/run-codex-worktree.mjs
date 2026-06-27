#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const workspaceRoot = process.cwd();
export const defaultWorktreeRoot = path.join(os.tmpdir(), "lhr-codex-worktrees");

const runnableJobStatuses = new Set(["planned", "ready", "running"]);

function usage() {
  console.error(`Usage:
  npm run agent:codex:worktree -- --job-file <path> [options]

Options:
  --execute                    Run codex exec through the existing wrapper. Without this, run wrapper dry-run in the worktree.
  --plan-only                  Print the isolated execution plan without creating a worktree.
  --worktree-root <path>       Default: ${defaultWorktreeRoot}
  --worktree-path <path>       Exact worktree path. Default: <worktree-root>/<job-id>-<timestamp>.
  --base-ref <ref>             Git ref used for the detached worktree. Default: HEAD.
  --allow-dirty                Allow foreground checkout changes when creating the worktree.
  --post-export-verify         Forward to npm run agent:codex.
  --timeout-ms <integer>       Forward to npm run agent:codex.
  --no-output-timeout-ms <int> Forward to npm run agent:codex.
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
    execute: false,
    planOnly: false,
    worktreeRoot: defaultWorktreeRoot,
    baseRef: "HEAD",
    allowDirty: false,
    postExportVerify: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--job-file":
        options.jobFile = argv[++index];
        break;
      case "--execute":
        options.execute = true;
        break;
      case "--plan-only":
        options.planOnly = true;
        break;
      case "--worktree-root":
        options.worktreeRoot = argv[++index];
        break;
      case "--worktree-path":
        options.worktreePath = argv[++index];
        break;
      case "--base-ref":
        options.baseRef = argv[++index];
        break;
      case "--allow-dirty":
        options.allowDirty = true;
        break;
      case "--post-export-verify":
        options.postExportVerify = true;
        break;
      case "--timeout-ms":
        options.timeoutMs = parsePositiveInteger(argv[++index], "--timeout-ms");
        break;
      case "--no-output-timeout-ms":
        options.noOutputTimeoutMs = parsePositiveInteger(argv[++index], "--no-output-timeout-ms");
        break;
      case "--help":
      case "-h":
        usage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.jobFile) {
    usage();
    process.exit(2);
  }

  return options;
}

function toPosixRelative(filePath) {
  return path.relative(workspaceRoot, filePath).split(path.sep).join("/");
}

function resolveRepoPath(relativeOrAbsolutePath) {
  return path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(workspaceRoot, relativeOrAbsolutePath);
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "z");
}

function runGit(args, { cwd = workspaceRoot } = {}) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
  }

  return result.stdout.trim();
}

function runGitBuffer(args, { cwd = workspaceRoot } = {}) {
  const result = spawnSync("git", args, {
    cwd
  });

  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout).toString("utf8").trim()}`);
  }

  return result.stdout;
}

function runGitInput(args, input, { cwd = workspaceRoot } = {}) {
  const result = spawnSync("git", args, {
    cwd,
    input
  });

  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout).toString("utf8").trim()}`);
  }

  return result.stdout.toString("utf8").trim();
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJob(jobFile) {
  const jobFilePath = resolveRepoPath(jobFile);
  const relativePath = toPosixRelative(jobFilePath);
  if (!relativePath || relativePath.startsWith("..")) {
    throw new Error(`job-file must stay inside the repository: ${jobFile}`);
  }

  const job = JSON.parse(await fs.readFile(jobFilePath, "utf8"));
  if (job.record_type !== "codex_job") {
    throw new Error(`${relativePath}: expected record_type "codex_job".`);
  }
  if (!runnableJobStatuses.has(job.lifecycle_status)) {
    throw new Error(`${relativePath}: lifecycle_status "${job.lifecycle_status}" is not runnable.`);
  }

  return { job, relativePath };
}

function assertForegroundReady({ allowDirty }) {
  const status = runGit(["status", "--porcelain", "--untracked-files=all"]);
  if (status && !allowDirty) {
    throw new Error("Foreground checkout has changes; commit, stash, or rerun with --allow-dirty to overlay those changes into the worktree.");
  }
}

function defaultWorktreePath({ job, worktreeRoot }) {
  return path.join(path.resolve(worktreeRoot), `${slug(job.id)}-${timestamp()}`);
}

function isInsideDirectory(candidatePath, directoryPath) {
  const relativePath = path.relative(directoryPath, candidatePath);
  return Boolean(relativePath) && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function assertWorktreePathOutsideWorkspace(worktreePath) {
  const resolvedWorktreePath = path.resolve(worktreePath);
  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  if (resolvedWorktreePath === resolvedWorkspaceRoot || isInsideDirectory(resolvedWorktreePath, resolvedWorkspaceRoot)) {
    throw new Error(`Worktree path must be outside the foreground repository: ${worktreePath}`);
  }
}

export async function buildExecutionPlan(options) {
  const { job, relativePath } = await readJob(options.jobFile);
  const worktreePath = path.resolve(options.worktreePath ?? defaultWorktreePath({ job, worktreeRoot: options.worktreeRoot ?? defaultWorktreeRoot }));
  assertWorktreePathOutsideWorkspace(worktreePath);
  const command = [
    "npm",
    "run",
    "agent:codex",
    "--",
    "--job-file",
    relativePath,
    "--workdir",
    worktreePath
  ];

  if (options.execute) {
    command.push("--execute");
  }
  if (options.postExportVerify) {
    command.push("--post-export-verify");
  }
  if (options.timeoutMs) {
    command.push("--timeout-ms", String(options.timeoutMs));
  }
  if (options.noOutputTimeoutMs) {
    command.push("--no-output-timeout-ms", String(options.noOutputTimeoutMs));
  }

  return {
    schema_version: "1.0.0",
    job_file: relativePath,
    job_id: job.id,
    execute: Boolean(options.execute),
    plan_only: Boolean(options.planOnly),
    base_ref: options.baseRef ?? "HEAD",
    dirty_overlay: Boolean(options.allowDirty),
    worktree_path: worktreePath,
    wrapper_cwd: worktreePath,
    command
  };
}

async function copyOverlayPath(sourcePath, targetPath, skippedPaths) {
  const stat = await fs.lstat(sourcePath);

  if (stat.isDirectory()) {
    await fs.mkdir(targetPath, { recursive: true });
    const entries = await fs.readdir(sourcePath);
    for (const entry of entries) {
      await copyOverlayPath(path.join(sourcePath, entry), path.join(targetPath, entry), skippedPaths);
    }
    return true;
  }

  if (stat.isSymbolicLink()) {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.symlink(await fs.readlink(sourcePath), targetPath);
    return true;
  }

  if (stat.isFile()) {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.copyFile(sourcePath, targetPath);
    return true;
  }

  skippedPaths.push(toPosixRelative(sourcePath));
  return false;
}

async function copyUntrackedFileToWorktree(relativePath, worktreePath, skippedPaths) {
  const sourcePath = path.join(workspaceRoot, relativePath);
  const targetPath = path.join(worktreePath, relativePath);
  if (!(await exists(sourcePath))) {
    return false;
  }

  return copyOverlayPath(sourcePath, targetPath, skippedPaths);
}

async function applyDirtyOverlay(plan, options) {
  if (!options.allowDirty) {
    return;
  }

  const diff = runGitBuffer(["diff", "--binary", options.baseRef ?? "HEAD"]);
  if (diff.length > 0) {
    runGitInput(["apply", "--binary"], diff, { cwd: plan.worktree_path });
  }

  const status = runGitBuffer(["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const untrackedPaths = status
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter((entry) => entry.startsWith("?? "))
    .map((entry) => entry.slice(3));

  const skippedPaths = [];
  let copiedPathCount = 0;
  for (const relativePath of untrackedPaths) {
    if (await copyUntrackedFileToWorktree(relativePath, plan.worktree_path, skippedPaths)) {
      copiedPathCount += 1;
    }
  }

  plan.dirty_overlay_paths = copiedPathCount;
  if (skippedPaths.length > 0) {
    plan.dirty_overlay_skipped_paths = skippedPaths.sort((left, right) => left.localeCompare(right));
  }
}

export async function prepareWorktree(plan, options) {
  assertForegroundReady({ allowDirty: options.allowDirty });
  if (await exists(plan.worktree_path)) {
    throw new Error(`Worktree path already exists: ${plan.worktree_path}`);
  }

  await fs.mkdir(path.dirname(plan.worktree_path), { recursive: true });
  runGit(["worktree", "add", "--detach", plan.worktree_path, options.baseRef ?? "HEAD"]);
  await applyDirtyOverlay(plan, options);

  const sourceNodeModules = path.join(workspaceRoot, "node_modules");
  const targetNodeModules = path.join(plan.worktree_path, "node_modules");
  if ((await exists(sourceNodeModules)) && !(await exists(targetNodeModules))) {
    await fs.symlink(sourceNodeModules, targetNodeModules, "dir");
  }
}

function runWrapper(plan) {
  return new Promise((resolve, reject) => {
    const child = spawn(plan.command[0], plan.command.slice(1), {
      cwd: plan.wrapper_cwd,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`isolated Codex wrapper exited with code ${code}`));
      }
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const plan = await buildExecutionPlan(options);

  if (options.planOnly) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  await prepareWorktree(plan, options);
  console.log(JSON.stringify({ type: "codex_worktree.prepared", ...plan }));
  await runWrapper(plan);
  console.log(JSON.stringify({ type: "codex_worktree.completed", job_id: plan.job_id, worktree_path: plan.worktree_path }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
