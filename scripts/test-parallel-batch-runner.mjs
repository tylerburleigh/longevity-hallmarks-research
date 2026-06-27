#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const workspaceRoot = process.cwd();
const runnerScriptPath = path.join(workspaceRoot, "scripts", "run-parallel-codex-batch.mjs");
const importScriptPath = path.join(workspaceRoot, "scripts", "import-parallel-batch-run.mjs");

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

async function writeAutoAllowDirtyFixture(tempRoot) {
  await writeJson(tempRoot, "ops/codex-jobs/live/auto-allow-dirty-job.json", {
    schema_version: "1.0.0",
    record_type: "codex_job",
    id: "auto-allow-dirty-job",
    lifecycle_status: "ready",
    agent_role: "self_healing_agent",
    mode: "agent_directed",
    prompt_file: "docs/prompts/codex-agents/parallel-synthetic-candidate.md",
    output_path: "research/agent-runs/auto-allow-dirty-job.json",
    jsonl_log_path: "research/agent-runs/logs/auto-allow-dirty-job.jsonl"
  });
  const planPath = path.join(tempRoot, "auto-allow-dirty-plan.json");
  await fs.writeFile(
    planPath,
    `${JSON.stringify(
      {
        schema_version: "1.0.0",
        record_type: "parallel_batch_plan",
        id: "auto-allow-dirty-plan",
        generated_at: "2026-06-23T00:00:00.000Z",
        source_job_root: "ops/codex-jobs/live",
        batches: [
          {
            sequence: 1,
            batch_id: "auto-allow-dirty-batch",
            parallel_group: "runner-fixture",
            execution_class: "independent",
            reconciliation_required: false,
            job_ids: ["auto-allow-dirty-job"],
            job_paths: ["ops/codex-jobs/live/auto-allow-dirty-job.json"],
            commands: [["sh", "-c", "exit 0", "agent:codex:worktree"]],
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

async function writeFailureDiagnosticFixture(tempRoot) {
  await writeJson(tempRoot, "ops/codex-jobs/live/failure-diagnostic-job.json", {
    schema_version: "1.0.0",
    record_type: "codex_job",
    id: "failure-diagnostic-job",
    lifecycle_status: "ready",
    agent_role: "supervisor_agent",
    mode: "agent_directed",
    prompt_file: "docs/prompts/codex-agents/supervisor-review.md",
    output_path: "research/agent-runs/failure-diagnostic-job.json",
    jsonl_log_path: "research/agent-runs/logs/failure-diagnostic-job.jsonl"
  });
  const planPath = path.join(tempRoot, "failure-diagnostic-plan.json");
  await fs.writeFile(
    planPath,
    `${JSON.stringify(
      {
        schema_version: "1.0.0",
        record_type: "parallel_batch_plan",
        id: "failure-diagnostic-plan",
        generated_at: "2026-06-23T00:00:00.000Z",
        source_job_root: "ops/codex-jobs/live",
        batches: [
          {
            sequence: 1,
            batch_id: "failure-diagnostic-batch",
            parallel_group: "runner-fixture",
            execution_class: "independent",
            reconciliation_required: false,
            job_ids: ["failure-diagnostic-job"],
            job_paths: ["ops/codex-jobs/live/failure-diagnostic-job.json"],
            commands: [["sh", "-c", "echo 'Error: isolated Codex wrapper exited with code 70' >&2; exit 1"]],
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

async function writeUsageLimitDiagnosticFixture(tempRoot) {
  await writeJson(tempRoot, "ops/codex-jobs/live/usage-limit-job.json", {
    schema_version: "1.0.0",
    record_type: "codex_job",
    id: "usage-limit-job",
    lifecycle_status: "ready",
    agent_role: "self_healing_agent",
    mode: "agent_directed",
    prompt_file: "docs/prompts/codex-agents/self-healing-repair.md",
    output_path: "research/agent-runs/usage-limit-job.json",
    jsonl_log_path: "research/agent-runs/logs/usage-limit-job.jsonl"
  });
  const planPath = path.join(tempRoot, "usage-limit-plan.json");
  await fs.writeFile(
    planPath,
    `${JSON.stringify(
      {
        schema_version: "1.0.0",
        record_type: "parallel_batch_plan",
        id: "usage-limit-plan",
        generated_at: "2026-06-23T00:00:00.000Z",
        source_job_root: "ops/codex-jobs/live",
        batches: [
          {
            sequence: 1,
            batch_id: "usage-limit-batch",
            parallel_group: "runner-fixture",
            execution_class: "independent",
            reconciliation_required: false,
            job_ids: ["usage-limit-job"],
            job_paths: ["ops/codex-jobs/live/usage-limit-job.json"],
            commands: [
              [
                "sh",
                "-c",
                "echo '{\"type\":\"error\",\"message\":\"You have hit your usage limit. Visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again later.\"}'; exit 1"
              ]
            ],
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

async function writeImportPendingWorkerFixture(tempRoot) {
  await writeJson(tempRoot, "package.json", {
    scripts: {
      "validate:records": "node -e \"process.exit(0)\""
    }
  });
  await writeJson(tempRoot, "ops/codex-jobs/live/import-job.json", {
    schema_version: "1.0.0",
    record_type: "codex_job",
    id: "import-job",
    lifecycle_status: "ready",
    agent_role: "self_healing_agent",
    mode: "agent_directed",
    prompt_file: "docs/prompts/codex-agents/self-healing-repair.md",
    output_path: "research/agent-runs/import-job.json",
    jsonl_log_path: "research/agent-runs/logs/import-job.jsonl"
  });

  const worktreePath = path.join(tempRoot, "worker-worktree");
  await writeJson(worktreePath, "data/candidate-changes/import-candidate.json", {
    schema_version: "1.0.0",
    record_type: "candidate_change",
    id: "import-candidate",
    name: "Import candidate",
    lifecycle_status: "submitted",
    submitted_at: "2026-06-23T00:00:00Z",
    scope: {
      question: "Fixture candidate."
    },
    proposed_records: [
      {
        record_type: "candidate_change",
        record_id: "import-candidate",
        path: "data/candidate-changes/import-candidate.json",
        change_type: "create",
        rationale: "Fixture."
      }
    ],
    required_review_lanes: []
  });
  await writeJson(worktreePath, "research/agent-runs/import-job.json", {
    schema_version: "1.0.0",
    record_type: "agent_run",
    id: "import-job",
    agent_role: "self_healing_agent",
    agent_id: "fixture",
    mode: "agent_directed",
    started_at: "2026-06-23T00:00:00Z",
    completed_at: "2026-06-23T00:00:01Z",
    status: "succeeded",
    scope: {
      question: "Fixture import job.",
      hallmark_ids: [],
      track_ids: [],
      intervention_ids: []
    },
    canonical_write_policy: "candidate_change_required",
    execution: {
      surface: "codex_exec",
      isolation: "git_worktree",
      workspace_path: worktreePath,
      prompt_file: "research/agent-runs/prompts/import-job.md",
      prompt_template_file: "docs/prompts/codex-agents/self-healing-repair.md",
      job_file: "ops/codex-jobs/live/import-job.json",
      output_schema_path: "schemas/agent-run.codex-output.schema.json",
      output_path: "research/agent-runs/import-job.json",
      jsonl_log_path: "research/agent-runs/logs/import-job.jsonl",
      sandbox: "workspace-write",
      approval_policy: "never"
    },
    inputs: [],
    outputs: {
      summary: "Fixture import output.",
      candidate_change_id: "import-candidate",
      proposed_records: [
        {
          record_type: "candidate_change",
          record_id: "import-candidate",
          path: "data/candidate-changes/import-candidate.json",
          change_type: "create",
          rationale: "Fixture."
        }
      ],
      generated_files: [],
      export_paths: []
    },
    quality_checks: [],
    blocking_issues: [],
    next_actions: []
  });
  await fs.mkdir(path.join(worktreePath, "research/agent-runs/prompts"), { recursive: true });
  await fs.writeFile(path.join(worktreePath, "research/agent-runs/prompts/import-job.md"), "Fixture prompt.\n");
  await fs.mkdir(path.join(worktreePath, "research/agent-runs/logs"), { recursive: true });
  await fs.writeFile(path.join(worktreePath, "research/agent-runs/logs/import-job.jsonl"), "{\"type\":\"fixture\"}\n");
  await fs.writeFile(path.join(worktreePath, "research/agent-runs/logs/import-job.command.jsonl"), "{\"type\":\"command\"}\n");

  await writeJson(tempRoot, "ops/codex-batches/runs/import-run.json", {
    schema_version: "1.0.0",
    record_type: "parallel_batch_run",
    id: "import-run",
    batch_plan_id: "fixture-plan",
    batch_plan_path: "ops/codex-batches/parallel-batch-plan.v1.json",
    batch_id: "import-batch",
    batch_sequence: 1,
    parallel_group: "fixture",
    execution_class: "independent",
    reconciliation_required: false,
    started_at: "2026-06-23T00:00:00Z",
    status: "partial",
    log_path: "ops/codex-batches/logs/import-run.jsonl",
    worker_states: [
      {
        job_id: "import-job",
        job_path: "ops/codex-jobs/live/import-job.json",
        command: ["node", "-e", "process.exit(0)"],
        status: "succeeded_pending_reconciliation",
        started_at: "2026-06-23T00:00:00Z",
        worktree_path: worktreePath,
        completed_at: "2026-06-23T00:00:01Z",
        exit_code: 0,
        output_path: "research/agent-runs/import-job.json",
        worker_log_path: "research/agent-runs/logs/import-job.jsonl",
        issues: ["research/agent-runs/import-job.json is not present in the coordinator checkout."]
      }
    ],
    summary: {
      planned_count: 0,
      running_count: 0,
      succeeded_count: 0,
      pending_reconciliation_count: 1,
      failed_count: 0,
      archived_count: 0
    },
    next_actions: ["Reconcile successful worker worktrees into the coordinator checkout, then rerun audits and archive completed job specs."]
  });
  await fs.mkdir(path.join(tempRoot, "ops/codex-batches/logs"), { recursive: true });
  await fs.writeFile(path.join(tempRoot, "ops/codex-batches/logs/import-run.jsonl"), "{\"type\":\"fixture\"}\n");
}

async function writeInterruptionFixture(tempRoot) {
  await writeJson(tempRoot, "ops/codex-jobs/live/interruption-running-job.json", {
    schema_version: "1.0.0",
    record_type: "codex_job",
    id: "interruption-running-job",
    lifecycle_status: "ready",
    agent_role: "self_healing_agent",
    mode: "agent_directed",
    prompt_file: "docs/prompts/codex-agents/parallel-synthetic-candidate.md",
    output_path: "research/agent-runs/interruption-running-job.json",
    jsonl_log_path: "research/agent-runs/logs/interruption-running-job.jsonl"
  });
  await writeJson(tempRoot, "ops/codex-jobs/live/interruption-planned-job.json", {
    schema_version: "1.0.0",
    record_type: "codex_job",
    id: "interruption-planned-job",
    lifecycle_status: "ready",
    agent_role: "self_healing_agent",
    mode: "agent_directed",
    prompt_file: "docs/prompts/codex-agents/parallel-synthetic-candidate.md",
    output_path: "research/agent-runs/interruption-planned-job.json",
    jsonl_log_path: "research/agent-runs/logs/interruption-planned-job.jsonl"
  });
  const planPath = path.join(tempRoot, "interruption-plan.json");
  const longRunningCommand = [process.execPath, "-e", "setTimeout(() => {}, 30000)"];
  await fs.writeFile(
    planPath,
    `${JSON.stringify(
      {
        schema_version: "1.0.0",
        record_type: "parallel_batch_plan",
        id: "interruption-plan",
        generated_at: "2026-06-23T00:00:00.000Z",
        source_job_root: "ops/codex-jobs/live",
        batches: [
          {
            sequence: 1,
            batch_id: "interruption-batch",
            parallel_group: "runner-fixture",
            execution_class: "independent",
            reconciliation_required: false,
            job_ids: ["interruption-running-job", "interruption-planned-job"],
            job_paths: [
              "ops/codex-jobs/live/interruption-running-job.json",
              "ops/codex-jobs/live/interruption-planned-job.json"
            ],
            commands: [longRunningCommand, longRunningCommand],
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

async function waitFor(predicate, label, timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function waitForChildClose(child, timeoutMs = 5000) {
  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Timed out waiting for child process to close."));
    }, timeoutMs);
    child.on("close", (status, signal) => {
      clearTimeout(timeout);
      resolve({ status, signal });
    });
  });
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

async function runInterruptionCase(tempRoot) {
  const planPath = await writeInterruptionFixture(tempRoot);
  const runPath = path.join(tempRoot, "ops/codex-batches/runs/interruption-run.json");
  const child = spawn(
    process.execPath,
    [
      runnerScriptPath,
      "--plan",
      planPath,
      "--batch-id",
      "interruption-batch",
      "--run-id",
      "interruption-run",
      "--execute",
      "--max-workers",
      "1"
    ],
    {
      cwd: tempRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        npm_config_update_notifier: "false"
      }
    }
  );

  const output = { stdout: "", stderr: "" };
  child.stdout.on("data", (chunk) => {
    output.stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output.stderr += chunk.toString();
  });

  const issues = [];
  try {
    await waitFor(async () => {
      try {
        const runRecord = JSON.parse(await fs.readFile(runPath, "utf8"));
        return runRecord.worker_states?.[0]?.status === "running";
      } catch {
        return false;
      }
    }, "interruption fixture worker to start");

    child.kill("SIGTERM");
    const result = await waitForChildClose(child);
    if (result.status !== 1) {
      issues.push(`interruption run should exit 1, found status ${result.status} signal ${result.signal}.`);
    }
  } catch (error) {
    issues.push(`interruption run failed: ${error.message}; stdout=${output.stdout.trim()} stderr=${output.stderr.trim()}`);
    child.kill("SIGKILL");
    await waitForChildClose(child).catch(() => {});
  }

  let runRecord;
  try {
    runRecord = JSON.parse(await fs.readFile(runPath, "utf8"));
  } catch (error) {
    issues.push(`interruption run record missing or invalid: ${error.message}`);
  }

  assertEqual(runRecord?.status, "failed", "interruption run status", issues);
  assertEqual(runRecord?.summary?.running_count, 0, "interruption running count", issues);
  assertEqual(runRecord?.summary?.failed_count, 2, "interruption failed count", issues);
  if (!runRecord?.completed_at) {
    issues.push("interruption run should record completed_at.");
  }
  for (const worker of runRecord?.worker_states ?? []) {
    assertEqual(worker.status, "failed", `interruption worker ${worker.job_id} status`, issues);
    if (
      !worker.issues?.some(
        (issue) =>
          issue.includes("Worker interrupted by coordinator signal SIGTERM.") ||
          issue.includes("Worker exited after signal SIGTERM.")
      )
    ) {
      issues.push(`interruption worker ${worker.job_id} should record a SIGTERM issue.`);
    }
  }

  if (issues.length > 0) {
    return issues;
  }

  console.log("PASS parallel-batch-runner-interruption-finalization");
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

async function runAutoAllowDirtyCase(tempRoot) {
  const planPath = await writeAutoAllowDirtyFixture(tempRoot);
  const result = spawnSync(
    "node",
    [
      runnerScriptPath,
      "--plan",
      planPath,
      "--batch-id",
      "auto-allow-dirty-batch",
      "--run-id",
      "auto-allow-dirty-run",
      "--execute"
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
    issues.push(`auto allow-dirty run failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    issues.push(`auto allow-dirty run exited ${result.status}: ${(result.stderr ?? "").trim()}`);
  }

  let runRecord;
  try {
    runRecord = JSON.parse(await fs.readFile(path.join(tempRoot, "ops/codex-batches/runs/auto-allow-dirty-run.json"), "utf8"));
  } catch (error) {
    issues.push(`auto allow-dirty run record missing or invalid: ${error.message}`);
  }

  const command = runRecord?.worker_states?.[0]?.command ?? [];
  assertIncludes(command, "--allow-dirty", "execute command", issues);
  assertEqual(runRecord?.status, "succeeded", "auto allow-dirty run status", issues);

  if (issues.length > 0) {
    return issues;
  }

  console.log("PASS parallel-batch-runner-auto-allow-dirty-after-run-state");
  return [];
}

async function runFailureDiagnosticCase(tempRoot) {
  const planPath = await writeFailureDiagnosticFixture(tempRoot);
  const result = spawnSync(
    "node",
    [
      runnerScriptPath,
      "--plan",
      planPath,
      "--batch-id",
      "failure-diagnostic-batch",
      "--run-id",
      "failure-diagnostic-run",
      "--execute"
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
    issues.push(`failure diagnostic run failed to start: ${result.error.message}`);
  }
  if (result.status !== 1) {
    issues.push(`failure diagnostic run should exit 1, found ${result.status}.`);
  }

  let runRecord;
  try {
    runRecord = JSON.parse(await fs.readFile(path.join(tempRoot, "ops/codex-batches/runs/failure-diagnostic-run.json"), "utf8"));
  } catch (error) {
    issues.push(`failure diagnostic run record missing or invalid: ${error.message}`);
  }

  const worker = runRecord?.worker_states?.[0];
  assertEqual(runRecord?.status, "failed", "failure diagnostic run status", issues);
  assertEqual(worker?.status, "failed", "failure diagnostic worker status", issues);
  if (!worker?.issues?.some((issue) => issue.includes("isolated Codex wrapper exited with code 70"))) {
    issues.push("failure diagnostic worker should preserve the known worker stderr diagnostic.");
  }

  if (issues.length > 0) {
    return issues;
  }

  console.log("PASS parallel-batch-runner-failure-diagnostics");
  return [];
}

async function runUsageLimitDiagnosticCase(tempRoot) {
  const planPath = await writeUsageLimitDiagnosticFixture(tempRoot);
  const result = spawnSync(
    "node",
    [
      runnerScriptPath,
      "--plan",
      planPath,
      "--batch-id",
      "usage-limit-batch",
      "--run-id",
      "usage-limit-run",
      "--execute"
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
    issues.push(`usage limit diagnostic run failed to start: ${result.error.message}`);
  }
  if (result.status !== 1) {
    issues.push(`usage limit diagnostic run should exit 1, found ${result.status}.`);
  }

  let runRecord;
  try {
    runRecord = JSON.parse(await fs.readFile(path.join(tempRoot, "ops/codex-batches/runs/usage-limit-run.json"), "utf8"));
  } catch (error) {
    issues.push(`usage limit run record missing or invalid: ${error.message}`);
  }

  const worker = runRecord?.worker_states?.[0];
  assertEqual(runRecord?.status, "failed", "usage limit run status", issues);
  assertEqual(worker?.status, "failed", "usage limit worker status", issues);
  if (!worker?.issues?.some((issue) => issue.includes("usage limit"))) {
    issues.push("usage limit worker should preserve the Codex usage-limit stdout event.");
  }

  if (issues.length > 0) {
    return issues;
  }

  console.log("PASS parallel-batch-runner-usage-limit-diagnostics");
  return [];
}

async function runImportPendingWorkerCase(tempRoot) {
  await writeImportPendingWorkerFixture(tempRoot);
  const result = spawnSync(
    "node",
    [
      importScriptPath,
      "--run",
      "import-run",
      "--skip-refresh"
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
    issues.push(`import helper failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    issues.push(`import helper exited ${result.status}: stdout=${result.stdout.trim()} stderr=${result.stderr.trim()}`);
  }

  let runRecord;
  try {
    runRecord = JSON.parse(await fs.readFile(path.join(tempRoot, "ops/codex-batches/runs/import-run.json"), "utf8"));
  } catch (error) {
    issues.push(`import run record missing or invalid: ${error.message}`);
  }

  const worker = runRecord?.worker_states?.[0];
  assertEqual(runRecord?.status, "succeeded", "import run status", issues);
  assertEqual(worker?.status, "succeeded", "import worker status", issues);
  assertEqual(worker?.archive_path, "ops/codex-jobs/archive/import-job.json", "import worker archive path", issues);
  if (worker?.issues) {
    issues.push("import worker should clear missing-output issue after import.");
  }

  const expectedPaths = [
    "data/candidate-changes/import-candidate.json",
    "research/agent-runs/import-job.json",
    "research/agent-runs/prompts/import-job.md",
    "research/agent-runs/logs/import-job.jsonl",
    "research/agent-runs/logs/import-job.command.jsonl",
    "ops/codex-jobs/archive/import-job.json"
  ];
  for (const relativePath of expectedPaths) {
    try {
      await fs.access(path.join(tempRoot, relativePath));
    } catch {
      issues.push(`import helper should create ${relativePath}.`);
    }
  }
  try {
    await fs.access(path.join(tempRoot, "ops/codex-jobs/live/import-job.json"));
    issues.push("import helper should remove archived live job.");
  } catch {
    // Expected.
  }

  let agentRun;
  try {
    agentRun = JSON.parse(await fs.readFile(path.join(tempRoot, "research/agent-runs/import-job.json"), "utf8"));
  } catch (error) {
    issues.push(`imported agent run missing or invalid: ${error.message}`);
  }
  assertEqual(agentRun?.execution?.job_file, "ops/codex-jobs/archive/import-job.json", "imported agent_run job_file", issues);

  if (issues.length > 0) {
    return issues;
  }

  console.log("PASS parallel-batch-import-pending-worker");
  return [];
}

async function main() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lhr-parallel-batch-runner-"));
  try {
    const issues = [
      ...(await runForwardedOptionsCase(tempRoot)),
      ...(await runAutoAllowDirtyCase(tempRoot)),
      ...(await runFailureDiagnosticCase(tempRoot)),
      ...(await runUsageLimitDiagnosticCase(tempRoot)),
      ...(await runInterruptionCase(tempRoot)),
      ...(await runArchiveCollisionCase(tempRoot)),
      ...(await runImportPendingWorkerCase(tempRoot))
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
