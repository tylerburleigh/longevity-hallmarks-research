#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  buildParallelBatchPlanFromJobs,
  workspaceRoot
} from "./plan-parallel-codex-batches.mjs";

const fixturePath = "tests/fixtures/scheduler-fixtures.json";
const generatedAt = "2026-06-22T00:00:00.000Z";

function usage() {
  console.error(`Usage: npm run test:scheduler-fixtures -- [--fixture <id>]`);
}

function parseArgs(argv) {
  const options = {
    fixtureId: undefined
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--fixture") {
      options.fixtureId = argv[++index];
      if (!options.fixtureId) {
        throw new Error("--fixture requires a value.");
      }
    } else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(workspaceRoot, relativePath), "utf8"));
}

function stableJson(value) {
  return JSON.stringify(value, null, 2);
}

function defaultCost() {
  return {
    cost_class: "low",
    expected_wall_time_ms: 600000,
    expected_token_budget: 10000,
    io_intensity: "low"
  };
}

function fixtureJobRecord(testCase, job) {
  return {
    schema_version: "1.0.0",
    record_type: "codex_job",
    id: job.id,
    lifecycle_status: job.lifecycle_status ?? "ready",
    agent_role: job.agent_role ?? "fixture_agent",
    mode: job.mode ?? "agent_directed",
    orchestration: {
      read_sets: job.read_sets ?? [],
      write_sets: job.write_sets ?? [],
      conflict_keys: job.conflict_keys ?? [],
      parallel_group: job.parallel_group ?? testCase.parallel_group,
      reconciliation_required: Boolean(job.reconciliation_required),
      expected_cost: {
        ...defaultCost(),
        ...(job.expected_cost ?? {})
      }
    }
  };
}

function fixtureJobs(testCase) {
  return (testCase.jobs ?? []).map((job) => ({
    record: fixtureJobRecord(testCase, job),
    path: `tests/fixtures/scheduler/${testCase.id}/${job.id}.json`
  }));
}

function addIssue(issues, message) {
  issues.push(`${message}`);
}

function checkEqual({ issues, fixtureId, field, expected, actual }) {
  if (stableJson(actual) !== stableJson(expected)) {
    addIssue(
      issues,
      `${fixtureId}: expected ${field} ${stableJson(expected)}, found ${stableJson(actual)}.`
    );
  }
}

function checkExpectedObject({ issues, fixtureId, owner, expected, actual }) {
  for (const [field, expectedValue] of Object.entries(expected ?? {})) {
    checkEqual({
      issues,
      fixtureId,
      field: `${owner}.${field}`,
      expected: expectedValue,
      actual: actual?.[field]
    });
  }
}

function checkExpectedBatches({ issues, fixtureId, expectedBatches, actualBatches }) {
  checkEqual({
    issues,
    fixtureId,
    field: "batches.length",
    expected: expectedBatches.length,
    actual: actualBatches.length
  });

  for (const [index, expectedBatch] of expectedBatches.entries()) {
    checkExpectedObject({
      issues,
      fixtureId,
      owner: `batches[${index}]`,
      expected: expectedBatch,
      actual: actualBatches[index]
    });
  }
}

function checkExpectedDeferredJobs({ issues, fixtureId, expectedDeferredJobs = [], actualDeferredJobs }) {
  const actualCompact = (actualDeferredJobs ?? []).map((job) => ({
    job_id: job.job_id,
    reason: job.reason
  }));

  checkEqual({
    issues,
    fixtureId,
    field: "deferred_jobs",
    expected: expectedDeferredJobs,
    actual: actualCompact
  });
}

async function runCase(testCase) {
  const plan = buildParallelBatchPlanFromJobs({
    liveJobs: fixtureJobs(testCase),
    generatedAt,
    maxWorkers: testCase.max_workers,
    sourceJobRoot: `tests/fixtures/scheduler/${testCase.id}`
  });
  const issues = [];

  checkExpectedObject({
    issues,
    fixtureId: testCase.id,
    owner: "summary",
    expected: testCase.expected?.summary,
    actual: plan.summary
  });
  checkExpectedBatches({
    issues,
    fixtureId: testCase.id,
    expectedBatches: testCase.expected?.batches ?? [],
    actualBatches: plan.batches
  });
  checkExpectedDeferredJobs({
    issues,
    fixtureId: testCase.id,
    expectedDeferredJobs: testCase.expected?.deferred_jobs ?? [],
    actualDeferredJobs: plan.deferred_jobs
  });

  return issues;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = await readJson(fixturePath);
  const fixtures = options.fixtureId
    ? (manifest.fixtures ?? []).filter((testCase) => testCase.id === options.fixtureId)
    : manifest.fixtures ?? [];

  if (options.fixtureId && fixtures.length === 0) {
    throw new Error(`Unknown scheduler fixture: ${options.fixtureId}`);
  }

  const failures = [];
  for (const testCase of fixtures) {
    const issues = await runCase(testCase);
    if (issues.length === 0) {
      console.log(`PASS ${testCase.id}`);
    } else {
      failures.push(...issues);
      console.log(`FAIL ${testCase.id}`);
    }
  }

  if (failures.length > 0) {
    console.error(`Scheduler fixture test failed with ${failures.length} issue(s):`);
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(`Scheduler fixtures passed: ${fixtures.length}/${fixtures.length}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
