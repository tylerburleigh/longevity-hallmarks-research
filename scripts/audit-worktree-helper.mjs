#!/usr/bin/env node

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { buildExecutionPlan, workspaceRoot } from "./run-codex-worktree.mjs";

const liveJobRoot = "ops/codex-jobs/live";
const mutableSandboxes = new Set(["workspace-write", "danger-full-access"]);

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

function runCommand(command, args, { cwd, timeoutMs = 30000 }) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: timeoutMs
  });

  if (result.error) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.error.message}`);
  }

  if (result.signal) {
    throw new Error(`${command} ${args.join(" ")} terminated by signal ${result.signal}: ${(result.stderr || result.stdout).trim()}`);
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
  }

  return result.stdout.trim();
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

async function auditBinaryDirtyOverlay(issues) {
  const tempParent = await fs.mkdtemp(path.join(os.tmpdir(), "lhr-worktree-binary-overlay-"));
  const tempRoot = path.join(tempParent, "repo");
  const worktreePath = path.join(tempParent, "worktree");
  const jobPath = "ops/codex-jobs/live/binary-overlay-job.json";
  try {
    await fs.mkdir(tempRoot, { recursive: true });
    runCommand("git", ["init", "-q"], { cwd: tempRoot });
    await fs.mkdir(path.join(tempRoot, "ops/codex-jobs/live"), { recursive: true });
    await fs.writeFile(path.join(tempRoot, ".gitignore"), "node_modules/\n.cache/\n");
    await fs.writeFile(path.join(tempRoot, "binary.dat"), Buffer.from([0, 1, 2, 3, 255, 254, 253, 252]));
    await fs.writeFile(
      path.join(tempRoot, jobPath),
      `${JSON.stringify(
        {
          schema_version: "1.0.0",
          record_type: "codex_job",
          id: "binary-overlay-job",
          lifecycle_status: "ready",
          agent_role: "self_healing_agent",
          mode: "agent_directed",
          prompt_file: "docs/prompts/codex-agents/parallel-synthetic-candidate.md",
          output_path: "research/agent-runs/binary-overlay-job.json",
          jsonl_log_path: "research/agent-runs/logs/binary-overlay-job.jsonl"
        },
        null,
        2
      )}\n`
    );
    runCommand("git", ["add", "."], { cwd: tempRoot });
    runCommand(
      "git",
      ["-c", "user.name=fixture", "-c", "user.email=fixture@example.test", "commit", "-q", "-m", "initial fixture"],
      { cwd: tempRoot }
    );

    const updatedBinary = Buffer.from([252, 253, 254, 255, 3, 2, 1, 0]);
    await fs.writeFile(path.join(tempRoot, "binary.dat"), updatedBinary);
    await fs.writeFile(path.join(tempRoot, "untracked-note.txt"), "copied through dirty overlay\n");
    await fs.writeFile(path.join(tempRoot, "HANDOFF.md"), "local handoff note should stay out of worker overlays\n");
    await fs.mkdir(path.join(tempRoot, "node_modules/fixture-package"), { recursive: true });
    await fs.writeFile(path.join(tempRoot, "node_modules/fixture-package/index.js"), "module.exports = true;\n");
    await fs.mkdir(path.join(tempRoot, "ops/codex-batches/logs"), { recursive: true });
    await fs.writeFile(path.join(tempRoot, "ops/codex-batches/logs/current-run.jsonl"), "{}\n");
    await fs.mkdir(path.join(tempRoot, "research/agent-runs/logs"), { recursive: true });
    await fs.writeFile(path.join(tempRoot, "research/agent-runs/logs/current-worker.jsonl"), "{}\n");

    const helperUrl = pathToFileURL(path.join(workspaceRoot, "scripts/run-codex-worktree.mjs")).href;
    const script = `
      import { buildExecutionPlan, prepareWorktree } from ${JSON.stringify(helperUrl)};
      const plan = await buildExecutionPlan({
        jobFile: ${JSON.stringify(jobPath)},
        worktreePath: ${JSON.stringify(worktreePath)},
        baseRef: "HEAD",
        allowDirty: true
      });
      await prepareWorktree(plan, { baseRef: "HEAD", allowDirty: true });
    `;
    runCommand(process.execPath, ["--input-type=module", "-e", script], { cwd: tempRoot });

    const worktreeBinary = await fs.readFile(path.join(worktreePath, "binary.dat"));
    if (!worktreeBinary.equals(updatedBinary)) {
      issues.push("binary dirty-overlay fixture: tracked binary diff was not reproduced in the worktree.");
    }
    if (!(await exists(path.join(worktreePath, "untracked-note.txt")))) {
      issues.push("binary dirty-overlay fixture: untracked file was not copied into the worktree.");
    }
    if (await exists(path.join(worktreePath, "HANDOFF.md"))) {
      issues.push("binary dirty-overlay fixture: local HANDOFF.md was copied into the worktree.");
    }
    if (await exists(path.join(worktreePath, "ops/codex-batches/logs/current-run.jsonl"))) {
      issues.push("binary dirty-overlay fixture: runtime batch log was copied into the worktree.");
    }
    if (await exists(path.join(worktreePath, "research/agent-runs/logs/current-worker.jsonl"))) {
      issues.push("binary dirty-overlay fixture: runtime worker log was copied into the worktree.");
    }
    const worktreeStatus = runCommand("git", ["status", "--short", "--untracked-files=all"], { cwd: worktreePath });
    if (worktreeStatus.includes("node_modules")) {
      issues.push("binary dirty-overlay fixture: node_modules symlink appeared in worktree git status.");
    }
  } finally {
    await fs.rm(tempParent, { recursive: true, force: true });
  }
}

async function main() {
  const issues = [];
  const jobFiles = await walkJsonFiles(path.join(workspaceRoot, liveJobRoot));
  let checkedCount = 0;

  for (const filePath of jobFiles) {
    const relativePath = toPosixRelative(filePath);
    const job = JSON.parse(await fs.readFile(filePath, "utf8"));
    if (job.record_type !== "codex_job") {
      continue;
    }
    if (!mutableSandboxes.has(job.execution?.sandbox)) {
      continue;
    }

    checkedCount += 1;
    const plan = await buildExecutionPlan({
      jobFile: relativePath,
      planOnly: true,
      worktreePath: path.join(os.tmpdir(), "lhr-codex-worktree-audit", job.id)
    });

    if (path.resolve(plan.worktree_path) === path.resolve(workspaceRoot)) {
      issues.push(`${relativePath}: isolated worktree helper resolved to the foreground checkout.`);
    }
    if (path.resolve(plan.wrapper_cwd) !== path.resolve(plan.worktree_path)) {
      issues.push(`${relativePath}: wrapper_cwd must match the isolated worktree path.`);
    }
    if (!plan.command.includes("--workdir") || !plan.command.includes(plan.worktree_path)) {
      issues.push(`${relativePath}: helper command must pass --workdir with the isolated worktree path.`);
    }
    if (plan.command.includes("--execute")) {
      issues.push(`${relativePath}: plan-only helper audit must not include --execute.`);
    }
    if (job.execution?.isolation !== "git_worktree" && job.execution?.isolation !== "codex_managed_worktree") {
      issues.push(`${relativePath}: mutable jobs should declare git_worktree or codex_managed_worktree isolation.`);
    }
  }

  await auditBinaryDirtyOverlay(issues);

  if (issues.length > 0) {
    console.error(`Worktree-helper audit failed with ${issues.length} issue(s):`);
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log(`Worktree-helper audit passed for ${checkedCount} mutable live job(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
