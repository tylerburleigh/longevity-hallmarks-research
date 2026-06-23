#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const workspaceRoot = process.cwd();
const runnerScriptPath = path.join(workspaceRoot, "scripts", "run-parallel-codex-batch.mjs");

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

async function writeJson(root, relativePath, value) {
  const filePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeArchiveCollisionFixture(tempRoot) {
  await writeJson(tempRoot, "ops/codex-jobs/live/archive-collision-job.json", {
    schema_version: "1.0.0",
    record_type: "codex_job",
    id: "archive-collision-job",
    lifecycle_status: "ready",
    agent_role: "self_healing_agent",
    mode: "agent_directed",
    prompt_file: "docs/prompts/codex-agents/parallel-synthetic-candidate.md",
    output_path: "research/agent-runs/archive-collision-job.json",
    jsonl_log_path: "research/agent-runs/logs/archive-collision-job.jsonl"
  });
  await writeJson(tempRoot, "ops/codex-jobs/archive/archive-collision-job.json", {
    schema_version: "1.0.0",
    record_type: "codex_job",
    id: "archive-collision-job",
    lifecycle_status: "succeeded",
    final_agent_run_id: "archive-collision-job",
    archived_at: "2026-06-23T00:00:00Z"
  });
  await writeJson(tempRoot, "research/agent-runs/archive-collision-job.json", {
    schema_version: "1.0.0",
    record_type: "agent_run",
    id: "archive-collision-job",
    agent_role: "self_healing_agent",
    agent_id: "fixture",
    started_at: "2026-06-23T00:00:00Z",
    completed_at: "2026-06-23T00:00:01Z",
    status: "succeeded",
    scope: {
      question: "Fixture output for archive collision recovery.",
      hallmark_ids: [],
      track_ids: [],
      intervention_ids: []
    },
    canonical_write_policy: "no_canonical_writes",
    execution: {
      surface: "codex_exec",
      isolation: "git_worktree",
      sandbox: "workspace-write",
      approval_policy: "never",
      job_file: "ops/codex-jobs/live/archive-collision-job.json"
    },
    outputs: {
      summary: "Fixture output."
    },
    quality_checks: []
  });

  const planPath = path.join(tempRoot, "archive-collision-plan.json");
  await fs.writeFile(
    planPath,
    `${JSON.stringify(
      {
        schema_version: "1.0.0",
        record_type: "parallel_batch_plan",
        id: "archive-collision-plan",
        generated_at: "2026-06-23T00:00:00.000Z",
        source_job_root: "ops/codex-jobs/live",
        batches: [
          {
            sequence: 1,
            batch_id: "archive-collision-batch",
            parallel_group: "runner-fixture",
            execution_class: "independent",
            reconciliation_required: false,
            job_ids: ["archive-collision-job"],
            job_paths: ["ops/codex-jobs/live/archive-collision-job.json"],
            commands: [["node", "-e", "process.exit(0)"]],
            overlapping_execution_keys: []
          }
        ],
        deferred_jobs: []
      },
      null,
      2
    )}\n`
  );
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

function assertEqual(actual, expected, label, issues) {
  if (actual !== expected) {
    issues.push(`${label}: expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}.`);
  }
}

async function runForwardedOptionsCase(tempRoot) {
  const planPath = await writeFixturePlan(tempRoot);
  const result = spawnSync(
    "node",
    [
      runnerScriptPath,
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
    return issues;
  }

  console.log("PASS parallel-batch-runner-forwarded-options");
  return [];
}

async function runArchiveCollisionCase(tempRoot) {
  const planPath = await writeArchiveCollisionFixture(tempRoot);
  const result = spawnSync(
    "node",
    [
      runnerScriptPath,
      "--plan",
      planPath,
      "--batch-id",
      "archive-collision-batch",
      "--run-id",
      "archive-collision-run",
      "--execute",
      "--archive-completed"
    ],
    {
      cwd: tempRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        npm_config_update_notifier: "false"
      }
    }
  );

  const issues = [];
  if (result.error) {
    issues.push(`archive collision run failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    issues.push(`archive collision run exited ${result.status}: ${(result.stderr ?? "").trim()}`);
  }

  let runRecord;
  try {
    runRecord = JSON.parse(await fs.readFile(path.join(tempRoot, "ops/codex-batches/runs/archive-collision-run.json"), "utf8"));
  } catch (error) {
    issues.push(`archive collision run record missing or invalid: ${error.message}`);
  }

  const worker = runRecord?.worker_states?.[0];
  assertEqual(runRecord?.status, "partial", "archive collision run status", issues);
  assertEqual(worker?.status, "succeeded_pending_reconciliation", "archive collision worker status", issues);
  assertEqual(worker?.output_path, "research/agent-runs/archive-collision-job.json", "archive collision worker output_path", issues);
  if (!worker?.issues?.some((issue) => issue.includes("ops/codex-jobs/archive/archive-collision-job.json already exists."))) {
    issues.push("archive collision worker should record an existing archive-path issue.");
  }

  if (issues.length > 0) {
    return issues;
  }

  console.log("PASS parallel-batch-runner-archive-collision-recovery");
  return [];
}

async function main() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lhr-parallel-batch-runner-"));
  try {
    const issues = [
      ...(await runForwardedOptionsCase(tempRoot)),
      ...(await runArchiveCollisionCase(tempRoot))
    ];
    if (issues.length > 0) {
      console.error(`Parallel-batch runner regression failed with ${issues.length} issue(s):`);
      for (const issue of issues) {
        console.error(`- ${issue}`);
      }
      process.exit(1);
    }
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
