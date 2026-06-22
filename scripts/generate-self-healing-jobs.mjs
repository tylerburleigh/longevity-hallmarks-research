#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const workspaceRoot = process.cwd();
export const triageStatePath = "ops/triage-state.v1.json";
export const generatedJobRoot = "ops/codex-jobs/live/generated-self-healing";
export const defaultLimit = 5;

const skippedJobTypes = new Set(["candidate_promotion"]);
const highCostJobTypes = new Set(["extraction_refresh", "coverage_repair", "snapshot_refresh"]);
const safetyPattern = /\b(safety|adverse[-_ ]?event|adverse|harm|tolerability|toxicity)\b/i;

const promptByJobType = {
  candidate_review: "docs/prompts/codex-agents/supervisor-review.md",
  extraction_refresh: "docs/prompts/codex-agents/extraction-refresh.md"
};

const agentRoleByJobType = {
  candidate_review: "supervisor_agent",
  extraction_refresh: "extraction_agent"
};

const modeByJobType = {
  coverage_repair: "coverage_repair",
  extraction_refresh: "extraction_refresh"
};

function usage() {
  console.error(`Usage: npm run jobs:self-healing -- [--limit <n>|--all] [--priority high|medium|low] [--job-type <type>] [--dry-run] [--replace] [--output-dir <path>]`);
}

export function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[._/-]+|[._/-]+$/g, "");
}

function idSlug(value) {
  return slug(value).replace(/\//g, "-");
}

function sortStrings(values) {
  return [...new Set((values ?? []).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function arrayFrom(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function parseArgs(argv) {
  const options = {
    limit: defaultLimit,
    priority: undefined,
    jobType: undefined,
    dryRun: false,
    replace: false,
    outputDir: generatedJobRoot
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--limit") {
      const limit = Number(argv[++index]);
      if (!Number.isInteger(limit) || limit < 1) {
        throw new Error("--limit must be a positive integer.");
      }
      options.limit = limit;
    } else if (arg === "--all") {
      options.limit = Number.POSITIVE_INFINITY;
    } else if (arg === "--priority") {
      options.priority = argv[++index];
      if (!["high", "medium", "low"].includes(options.priority)) {
        throw new Error("--priority must be high, medium, or low.");
      }
    } else if (arg === "--job-type") {
      options.jobType = argv[++index];
      if (!options.jobType) {
        throw new Error("--job-type requires a value.");
      }
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--replace") {
      options.replace = true;
    } else if (arg === "--output-dir") {
      options.outputDir = argv[++index];
      if (!options.outputDir) {
        throw new Error("--output-dir requires a value.");
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

export async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(workspaceRoot, relativePath), "utf8"));
}

async function writeJson(relativePath, value, { replace = false } = {}) {
  const filePath = path.join(workspaceRoot, relativePath);
  if (!replace && (await exists(filePath))) {
    return false;
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, stringifyJob(value));
  return true;
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

async function loadCanonicalRecords() {
  const roots = ["data", "research"];
  const files = (await Promise.all(roots.map((root) => walkJsonFiles(path.join(workspaceRoot, root))))).flat();
  const byPath = new Map();
  const byTypeAndId = new Map();

  for (const filePath of files) {
    const relativePath = toPosixRelative(filePath);
    const record = JSON.parse(await fs.readFile(filePath, "utf8"));
    byPath.set(relativePath, record);
    if (record.record_type && record.id) {
      byTypeAndId.set(`${record.record_type}:${record.id}`, { record, path: relativePath });
    }
  }

  return { byPath, byTypeAndId };
}

function getRecord(recordIndex, recordType, recordId) {
  return recordIndex.byTypeAndId.get(`${recordType}:${recordId}`)?.record;
}

function getInputRecords(recordIndex, recommendedJob) {
  return (recommendedJob.inputs ?? [])
    .map((inputPath) => recordIndex.byPath.get(inputPath))
    .filter(Boolean);
}

function scopeFromRecommendedJob(recordIndex, recommendedJob) {
  const inputRecords = getInputRecords(recordIndex, recommendedJob);
  const targetRecord = getRecord(recordIndex, recommendedJob.target_record_type, recommendedJob.target_record_id);
  const records = [targetRecord, ...inputRecords].filter(Boolean);
  const hallmarkIds = [];
  const trackIds = [];
  const interventionIds = [];
  const sourceIds = [];
  const studyIds = [];
  const outcomeIds = [];
  const resultIds = [];

  for (const record of records) {
    hallmarkIds.push(...arrayFrom(record.scope?.hallmark_ids));
    trackIds.push(...arrayFrom(record.scope?.track_ids));
    interventionIds.push(...arrayFrom(record.scope?.intervention_ids));
    hallmarkIds.push(...arrayFrom(record.hallmark_ids));
    hallmarkIds.push(...arrayFrom(record.measured_hallmark_ids));
    trackIds.push(...arrayFrom(record.track_ids));
    interventionIds.push(...arrayFrom(record.intervention_ids));
    sourceIds.push(...arrayFrom(record.source_id), ...arrayFrom(record.source_ids));
    studyIds.push(...arrayFrom(record.study_id), ...arrayFrom(record.study_ids));
    outcomeIds.push(...arrayFrom(record.outcome_id), ...arrayFrom(record.outcome_ids));
    resultIds.push(...arrayFrom(record.result_id), ...arrayFrom(record.result_ids));

    if (record.record_type === "coverage_assessment") {
      hallmarkIds.push(record.hallmark_id);
      trackIds.push(record.track_id);
    }

    if (record.record_type === "result") {
      resultIds.push(record.id);
      for (const findingId of record.finding_ids ?? []) {
        const finding = getRecord(recordIndex, "finding", findingId);
        hallmarkIds.push(...arrayFrom(finding?.hallmark_ids), ...arrayFrom(finding?.measured_hallmark_ids));
        trackIds.push(...arrayFrom(finding?.track_ids));
      }
      const study = getRecord(recordIndex, "study", record.study_id);
      interventionIds.push(...arrayFrom(study?.intervention_ids));
    }
  }

  if (recommendedJob.target_record_type === "source") {
    sourceIds.push(recommendedJob.target_record_id);
  } else if (recommendedJob.target_record_type === "study") {
    studyIds.push(recommendedJob.target_record_id);
  } else if (recommendedJob.target_record_type === "outcome") {
    outcomeIds.push(recommendedJob.target_record_id);
  } else if (recommendedJob.target_record_type === "result") {
    resultIds.push(recommendedJob.target_record_id);
  }

  const scope = {
    question: `${recommendedJob.job_type}: ${recommendedJob.rationale}`,
    hallmark_ids: sortStrings(hallmarkIds),
    track_ids: sortStrings(trackIds),
    intervention_ids: sortStrings(interventionIds)
  };

  const extraFields = {
    source_ids: sortStrings(sourceIds),
    study_ids: sortStrings(studyIds),
    outcome_ids: sortStrings(outcomeIds),
    result_ids: sortStrings(resultIds)
  };

  for (const [field, values] of Object.entries(extraFields)) {
    if (values.length > 0) {
      scope[field] = values;
    }
  }

  return scope;
}

function reviewLanesForJob(recordIndex, recommendedJob) {
  if (recommendedJob.job_type === "candidate_review") {
    const candidate = getRecord(recordIndex, "candidate_change", recommendedJob.target_record_id);
    return sortStrings(candidate?.required_review_lanes);
  }

  if (recommendedJob.job_type === "candidate_revision") {
    const candidate = getRecord(recordIndex, "candidate_change", recommendedJob.target_record_id);
    return sortStrings(candidate?.required_review_lanes);
  }

  const lanes = [];
  if (recommendedJob.target_record_type === "source_snapshot" || recommendedJob.target_record_type === "text_snapshot") {
    lanes.push("source_fidelity");
  }
  if (recommendedJob.job_type === "extraction_refresh" || recommendedJob.source === "extraction_debt") {
    lanes.push("extraction_fidelity", "taxonomy_mapping", "synthesis_boundary");
  }
  if (recommendedJob.target_record_type === "coverage_assessment") {
    lanes.push("taxonomy_mapping", "synthesis_boundary");
  }

  const searchable = [
    recommendedJob.job_id,
    recommendedJob.job_type,
    recommendedJob.rationale,
    ...(recommendedJob.inputs ?? [])
  ].join(" ");
  if (safetyPattern.test(searchable)) {
    lanes.push("safety_limitations");
  }

  return sortStrings(lanes);
}

function jobCost(recommendedJob) {
  if (recommendedJob.priority === "high" || highCostJobTypes.has(recommendedJob.job_type)) {
    return {
      cost_class: "high",
      expected_wall_time_ms: 3600000,
      expected_token_budget: 100000,
      io_intensity: highCostJobTypes.has(recommendedJob.job_type) ? "high" : "medium"
    };
  }

  return {
    cost_class: "medium",
    expected_wall_time_ms: 1800000,
    expected_token_budget: 60000,
    io_intensity: "medium"
  };
}

function agentRoleForJob(recommendedJob) {
  return agentRoleByJobType[recommendedJob.job_type] ?? "self_healing_agent";
}

function modeForJob(recommendedJob) {
  return modeByJobType[recommendedJob.job_type] ?? "agent_directed";
}

function promptForJob(recommendedJob) {
  return promptByJobType[recommendedJob.job_type] ?? "docs/prompts/codex-agents/self-healing-repair.md";
}

function parallelGroupForJob(recommendedJob) {
  return recommendedJob.job_type.replace(/_/g, "-");
}

function buildReadSets(recommendedJob) {
  return sortStrings([
    `path:${triageStatePath}`,
    `triage_job:${recommendedJob.job_id}`,
    ...((recommendedJob.inputs ?? []).map((inputPath) => `path:${inputPath}`))
  ]);
}

function buildWriteSets({ recommendedJob, candidateChangeId }) {
  return sortStrings([
    `candidate_change:${candidateChangeId}`,
    `path:data/candidate-changes/${candidateChangeId}.json`,
    `target_record:${recommendedJob.target_record_type}/${recommendedJob.target_record_id}`,
    ...((recommendedJob.inputs ?? []).map((inputPath) => `path:${inputPath}`))
  ]);
}

function buildConflictKeys({ recommendedJob, candidateChangeId }) {
  return sortStrings([
    `candidate_change:${candidateChangeId}`,
    `target_record:${recommendedJob.target_record_type}/${recommendedJob.target_record_id}`,
    `triage_job:${recommendedJob.job_id}`
  ]);
}

function buildQualityGates(recommendedJob) {
  const gates = [
    "validate_records",
    "audit_references",
    "audit_exports",
    "audit_agent_schemas",
    "audit_agentic_process",
    "worker_output_contract",
    "candidate_agent_run_ledger_match"
  ];

  if (recommendedJob.job_type === "candidate_review") {
    gates.push("supervisor_review_lanes");
  }

  return gates;
}

function buildJob(recordIndex, recommendedJob) {
  const jobId = idSlug(`self-healing-${recommendedJob.job_id}`);
  const candidateChangeId = idSlug(`${recommendedJob.job_id}-repair`);
  const requiredReviewLanes = reviewLanesForJob(recordIndex, recommendedJob);

  return {
    schema_version: "1.0.0",
    record_type: "codex_job",
    id: jobId,
    name: `Self-healing repair: ${recommendedJob.job_id}`,
    summary: recommendedJob.rationale,
    lifecycle_status: "ready",
    agent_role: agentRoleForJob(recommendedJob),
    mode: modeForJob(recommendedJob),
    prompt_file: promptForJob(recommendedJob),
    output_path: `research/agent-runs/${jobId}.json`,
    jsonl_log_path: `research/agent-runs/logs/${jobId}.jsonl`,
    scope: scopeFromRecommendedJob(recordIndex, recommendedJob),
    execution: {
      isolation: "git_worktree",
      sandbox: "workspace-write",
      approval_policy: "never",
      output_schema_path: "schemas/agent-run.codex-output.schema.json",
      timeout_ms: jobCost(recommendedJob).expected_wall_time_ms,
      no_output_timeout_ms: 300000
    },
    expected_outputs: {
      canonical_write_policy: "candidate_change_required",
      candidate_change_id: candidateChangeId,
      required_review_lanes: requiredReviewLanes
    },
    orchestration: {
      read_sets: buildReadSets(recommendedJob),
      write_sets: buildWriteSets({ recommendedJob, candidateChangeId }),
      conflict_keys: buildConflictKeys({ recommendedJob, candidateChangeId }),
      parallel_group: parallelGroupForJob(recommendedJob),
      reconciliation_required: true,
      expected_cost: jobCost(recommendedJob)
    },
    post_run: {
      export_latest: true,
      verify_knowledge_base: true
    },
    quality_gates: buildQualityGates(recommendedJob),
    notes: [
      `Generated from ${triageStatePath} recommended_jobs[] item ${recommendedJob.job_id}.`,
      `Source queue: ${recommendedJob.source}.`,
      "The worker should keep edits bounded to the target record, listed inputs, and the candidate repair ledger."
    ]
  };
}

export async function loadTriageState() {
  return readJson(triageStatePath);
}

export async function buildSelfHealingJobs(options = {}) {
  const triageState = options.triageState ?? (await loadTriageState());
  const recordIndex = options.recordIndex ?? (await loadCanonicalRecords());
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  const jobs = [];

  for (const recommendedJob of triageState.recommended_jobs ?? []) {
    if (skippedJobTypes.has(recommendedJob.job_type)) {
      continue;
    }
    if (options.priority && recommendedJob.priority !== options.priority) {
      continue;
    }
    if (options.jobType && recommendedJob.job_type !== options.jobType) {
      continue;
    }
    jobs.push(buildJob(recordIndex, recommendedJob));
    if (jobs.length >= limit) {
      break;
    }
  }

  return jobs;
}

export function generatedJobPath(job, outputDir = generatedJobRoot) {
  return `${outputDir.replace(/\/+$/g, "")}/${job.id}.json`;
}

export function stringifyJob(job) {
  return `${JSON.stringify(job, null, 2)}\n`;
}

async function existingJobIds() {
  const roots = ["ops/codex-jobs/live", "ops/codex-jobs/archive"];
  const ids = new Set();
  for (const root of roots) {
    for (const filePath of await walkJsonFiles(path.join(workspaceRoot, root))) {
      const job = JSON.parse(await fs.readFile(filePath, "utf8"));
      if (job.record_type === "codex_job" && job.id) {
        ids.add(job.id);
      }
    }
  }
  return ids;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const existingIds = await existingJobIds();
  const jobs = await buildSelfHealingJobs(options);
  const output = [];

  for (const job of jobs) {
    const relativePath = generatedJobPath(job, options.outputDir);
    const alreadyExists = existingIds.has(job.id);
    const written = options.dryRun || (alreadyExists && !options.replace)
      ? false
      : await writeJson(relativePath, job, { replace: options.replace });

    output.push({
      id: job.id,
      path: relativePath,
      status: options.dryRun ? "planned" : written ? "written" : alreadyExists ? "existing_job_id" : "existing_path"
    });
  }

  const summary = {
    generated_from: triageStatePath,
    selected_job_count: jobs.length,
    dry_run: options.dryRun,
    jobs: output
  };

  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
