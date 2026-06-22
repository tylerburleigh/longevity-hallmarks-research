#!/usr/bin/env node

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
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
