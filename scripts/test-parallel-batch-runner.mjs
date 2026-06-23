#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const workspaceRoot = process.cwd();

async function writeFixturePlan(tempRoot) {
  const planPath = path.join(tempRoot, "parallel-batch-plan.fixture.json");
  const plan = {
    schema_version: "1.0.0",
    record_type: "parallel_batch_plan",
    id: "parallel-batch-runner-fixture-plan",
    generated_at: "2026-06-23T00:00:00.000Z",
    source_job_root: "ops/codex-jobs/live",
    max_workers: 1,
    summary: {
      live_job_count: 1,
      schedulable_job_count: 1,
      deferred_job_count: 0,
      batch_count: 1,
      max_batch_width: 1,
      independent_batch_count: 1,
      reconciliation_batch_count: 0
    },
    batches: [
      {
        sequence: 1,
        batch_id: "parallel-batch-runner-fixture",
        parallel_group: "runner-fixture",
        execution_class: "independent",
        reconciliation_required: false,
        job_ids: ["fixture-job"],
        job_paths: ["ops/codex-jobs/live/fixture-job.json"],
        commands: [
          [
            "npm",
            "run",
            "agent:codex:worktree",
            "--",
            "--job-file",
            "ops/codex-jobs/live/fixture-job.json",
            "--execute"
          ]
        ],
        overlapping_execution_keys: []
      }
    ],
    deferred_jobs: []
  };
  await fs.writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  return planPath;
}

function assertIncludes(sequence, expected, label, issues) {
  if (!sequence.includes(expected)) {
    issues.push(`${label}: expected command to include ${JSON.stringify(expected)}.`);
  }
}

function assertNotIncludes(sequence, unexpected, label, issues) {
  if (sequence.includes(unexpected)) {
    issues.push(`${label}: expected command not to include ${JSON.stringify(unexpected)}.`);
  }
}

async function main() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lhr-parallel-batch-runner-"));
  try {
    const planPath = await writeFixturePlan(tempRoot);
    const result = spawnSync(
      "node",
      [
        "scripts/run-parallel-codex-batch.mjs",
        "--plan",
        planPath,
        "--batch-id",
        "parallel-batch-runner-fixture",
        "--run-id",
        "runner-fixture-preview",
        "--base-ref",
        "fixture-base-ref",
        "--allow-dirty",
        "--worktree-root",
        "/tmp/lhr-runner-fixture-worktrees",
        "--post-export-verify"
      ],
      {
        cwd: workspaceRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          npm_config_update_notifier: "false"
        }
      }
    );

    const issues = [];
    if (result.error) {
      issues.push(`runner failed to start: ${result.error.message}`);
    }
    if (result.status !== 0) {
      issues.push(`runner exited ${result.status}: ${(result.stderr ?? "").trim()}`);
    }

    let runRecord;
    try {
      runRecord = JSON.parse(result.stdout);
    } catch (error) {
      issues.push(`runner did not emit JSON preview: ${error.message}`);
    }

    const command = runRecord?.worker_states?.[0]?.command ?? [];
    assertIncludes(command, "--base-ref", "preview command", issues);
    assertIncludes(command, "fixture-base-ref", "preview command", issues);
    assertIncludes(command, "--allow-dirty", "preview command", issues);
    assertIncludes(command, "--worktree-root", "preview command", issues);
    assertIncludes(command, "/tmp/lhr-runner-fixture-worktrees", "preview command", issues);
    assertIncludes(command, "--post-export-verify", "preview command", issues);
    assertNotIncludes(command, "--execute", "preview command", issues);

    if (issues.length > 0) {
      console.error(`Parallel-batch runner regression failed with ${issues.length} issue(s):`);
      for (const issue of issues) {
        console.error(`- ${issue}`);
      }
      process.exit(1);
    }

    console.log("PASS parallel-batch-runner-forwarded-options");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
