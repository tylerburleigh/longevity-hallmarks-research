#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const workspaceRoot = process.cwd();
export const triageStatePath = "ops/triage-state.v1.json";
export const generatedJobRoot = "ops/codex-jobs/live/generated-self-healing";
export const supervisorReviewContextPackRoot = "ops/supervisor-review-context-packs";
export const extractionContextPackRoot = "ops/extraction-context-packs";
export const defaultLimit = 5;

const highCostJobTypes = new Set(["extraction_refresh", "coverage_repair", "snapshot_refresh"]);
const safetyPattern = /\b(safety|adverse[-_ ]?event|adverse|harm|tolerability|toxicity)\b/i;

const promptByJobType = {
  candidate_review: "docs/prompts/codex-agents/supervisor-review.md",
  candidate_promotion: "docs/prompts/codex-agents/candidate-promotion.md",
  extraction_refresh: "docs/prompts/codex-agents/extraction-refresh.md"
};

const agentRoleByJobType = {
  candidate_review: "supervisor_agent",
  candidate_promotion: "release_agent",
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

function getRecordPath(recordIndex, recordType, recordId) {
  return recordIndex.byTypeAndId.get(`${recordType}:${recordId}`)?.path;
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
  if (recommendedJob.job_type === "candidate_promotion") {
    return [];
  }

  if ((recommendedJob.required_review_lanes ?? []).length > 0) {
    return sortStrings(recommendedJob.required_review_lanes);
  }

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
  if (recommendedJob.job_type === "candidate_promotion") {
    return {
      cost_class: "low",
      expected_wall_time_ms: 300000,
      expected_token_budget: 10000,
      io_intensity: "low"
    };
  }

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

function sourceJobId(recommendedJob) {
  return recommendedJob.source_job_id ?? recommendedJob.job_id;
}

function candidateReviewLaneKey(recommendedJob, lane) {
  return `candidate_review:${recommendedJob.target_record_id}/${lane}`;
}

function scopedRecordReadPaths(recordIndex, scope) {
  const scopedRecordTypes = [
    ["source", scope?.source_ids],
    ["study", scope?.study_ids],
    ["outcome", scope?.outcome_ids],
    ["result", scope?.result_ids]
  ];
  const paths = [];

  for (const [recordType, recordIds] of scopedRecordTypes) {
    for (const recordId of recordIds ?? []) {
      const recordPath = getRecordPath(recordIndex, recordType, recordId);
      if (recordPath) {
        paths.push(recordPath);
      }
    }
  }

  return sortStrings(paths);
}

function provenanceSnapshotReadPaths(recordIndex, recordPaths) {
  const paths = [];

  for (const recordPath of recordPaths) {
    const record = recordIndex.byPath.get(recordPath);
    for (const locator of record?.provenance ?? []) {
      const sourceSnapshotPath = getRecordPath(recordIndex, "source_snapshot", locator.source_snapshot_id);
      if (sourceSnapshotPath) {
        paths.push(sourceSnapshotPath);
      }

      const textSnapshotPath = getRecordPath(recordIndex, "text_snapshot", locator.text_snapshot_id);
      if (textSnapshotPath) {
        paths.push(textSnapshotPath);
      }
    }
  }

  return sortStrings(paths);
}

function buildReadSets(recordIndex, recommendedJob, { contextPackId, scope } = {}) {
  const inputPaths = recommendedJob.inputs ?? [];
  const scopedPaths = scopedRecordReadPaths(recordIndex, scope);
  const snapshotPaths = recommendedJob.job_type === "extraction_refresh"
    ? provenanceSnapshotReadPaths(recordIndex, [...inputPaths, ...scopedPaths])
    : [];

  return sortStrings([
    `path:${triageStatePath}`,
    `triage_job:${sourceJobId(recommendedJob)}`,
    ...(contextPackId ? [`context_pack:${contextPackId}`] : []),
    ...inputPaths.map((inputPath) => `path:${inputPath}`),
    ...scopedPaths.map((recordPath) => `path:${recordPath}`),
    ...snapshotPaths.map((recordPath) => `path:${recordPath}`)
  ]);
}

function candidateReviewOutputSpec({ recommendedJob, candidateChangeId, requiredReviewLanes = [] }) {
  if (recommendedJob.job_type !== "candidate_review") {
    return {};
  }

  const [reviewLane] = requiredReviewLanes;
  const evidenceReviewId = idSlug(`${recommendedJob.target_record_id}-${reviewLane.replace(/_/g, "-")}`);
  const proposedRecordPaths = sortStrings([
    `data/candidate-changes/${candidateChangeId}.json`,
    `data/evidence-reviews/${evidenceReviewId}.json`
  ]);

  return {
    evidenceReviewId,
    proposedRecordPaths,
    generatedFilePaths: proposedRecordPaths,
    exportPaths: []
  };
}

function extractionOutputSpec(recordIndex, recommendedJob, candidateChangeId) {
  if (recommendedJob.job_type !== "extraction_refresh") {
    return {};
  }

  const targetPath = getRecordPath(recordIndex, recommendedJob.target_record_type, recommendedJob.target_record_id);
  const proposedRecordPaths = sortStrings([
    `data/candidate-changes/${candidateChangeId}.json`,
    targetPath
  ]);

  return {
    proposedRecordPaths,
    generatedFilePaths: proposedRecordPaths,
    exportPaths: [
      "exports/latest/audit-manifest.json",
      "exports/latest/coverage-status.json",
      "exports/latest/evidence-map.json",
      "exports/latest/read-model.sqlite",
      "ops/release-readiness.v1.json",
      "ops/reconciliation/parallel-reconciliation.v1.json",
      "ops/triage-state.v1.json",
      "ops/codex-batches/orchestration-metrics.v1.json"
    ]
  };
}

function buildWriteSets({ recommendedJob, candidateChangeId, requiredReviewLanes = [], proposedRecordPaths = [] }) {
  if (recommendedJob.job_type === "candidate_promotion") {
    return sortStrings([
      `promotion_check:${recommendedJob.target_record_id}`
    ]);
  }

  const candidateChangeKeys = [
    `candidate_change:${candidateChangeId}`,
    `path:data/candidate-changes/${candidateChangeId}.json`
  ];

  if (recommendedJob.job_type === "candidate_review") {
    return sortStrings([
      ...candidateChangeKeys,
      ...proposedRecordPaths.map((recordPath) => `path:${recordPath}`),
      ...requiredReviewLanes.map((lane) => candidateReviewLaneKey(recommendedJob, lane))
    ]);
  }

  return sortStrings([
    ...candidateChangeKeys,
    `target_record:${recommendedJob.target_record_type}/${recommendedJob.target_record_id}`,
    ...((recommendedJob.inputs ?? []).map((inputPath) => `path:${inputPath}`))
  ]);
}

function buildConflictKeys({ recommendedJob, candidateChangeId, requiredReviewLanes = [] }) {
  if (recommendedJob.job_type === "candidate_promotion") {
    return sortStrings([
      `promotion:${recommendedJob.target_record_id}`,
      `target_record:${recommendedJob.target_record_type}/${recommendedJob.target_record_id}`
    ]);
  }

  const candidateChangeKeys = [
    `candidate_change:${candidateChangeId}`
  ];

  if (recommendedJob.job_type === "candidate_review") {
    return sortStrings([
      ...candidateChangeKeys,
      ...requiredReviewLanes.map((lane) => candidateReviewLaneKey(recommendedJob, lane))
    ]);
  }

  return sortStrings([
    `candidate_change:${candidateChangeId}`,
    `target_record:${recommendedJob.target_record_type}/${recommendedJob.target_record_id}`,
    `triage_job:${sourceJobId(recommendedJob)}`,
    ...(agentRoleForJob(recommendedJob) === "supervisor_agent"
      ? requiredReviewLanes.map((lane) => `review_lane:${lane}`)
      : [])
  ]);
}

function reconciliationRequiredForJob(recommendedJob) {
  if (recommendedJob.job_type === "candidate_promotion") {
    return false;
  }

  return recommendedJob.job_type !== "candidate_review";
}

function buildQualityGates(recommendedJob) {
  if (recommendedJob.job_type === "candidate_promotion") {
    return [
      "validate_records",
      "audit_references",
      "audit_exports",
      "audit_triage_state",
      "audit_reconciliation",
      "audit_agent_schemas",
      "audit_agentic_process",
      "worker_output_contract"
    ];
  }

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
  const outputSpec = {
    ...extractionOutputSpec(recordIndex, recommendedJob, candidateChangeId),
    ...candidateReviewOutputSpec({ recommendedJob, candidateChangeId, requiredReviewLanes })
  };
  const contextPackId = ["candidate_review", "extraction_refresh"].includes(recommendedJob.job_type) ? jobId : undefined;
  const contextPackPath = recommendedJob.job_type === "candidate_review"
    ? `${supervisorReviewContextPackRoot}/${contextPackId}.json`
    : recommendedJob.job_type === "extraction_refresh"
      ? `${extractionContextPackRoot}/${contextPackId}.json`
      : undefined;
  const scope = scopeFromRecommendedJob(recordIndex, recommendedJob);

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
    ...(contextPackPath ? { context_pack_path: contextPackPath } : {}),
    output_path: `research/agent-runs/${jobId}.json`,
    jsonl_log_path: `research/agent-runs/logs/${jobId}.jsonl`,
    scope,
    execution: {
      isolation: "git_worktree",
      sandbox: "workspace-write",
      approval_policy: "never",
      output_schema_path: "schemas/agent-run.codex-output.schema.json",
      timeout_ms: jobCost(recommendedJob).expected_wall_time_ms,
      no_output_timeout_ms: 300000
    },
    expected_outputs: {
      canonical_write_policy: recommendedJob.job_type === "candidate_promotion" ? "no_canonical_writes" : "candidate_change_required",
      ...(recommendedJob.job_type === "candidate_promotion" ? {} : { candidate_change_id: candidateChangeId }),
      required_review_lanes: requiredReviewLanes,
      ...(outputSpec.proposedRecordPaths ? { proposed_record_paths: outputSpec.proposedRecordPaths } : {}),
      ...(outputSpec.generatedFilePaths ? { generated_file_paths: outputSpec.generatedFilePaths } : {}),
      ...(outputSpec.exportPaths ? { export_paths: outputSpec.exportPaths } : {})
    },
    orchestration: {
      read_sets: buildReadSets(recordIndex, recommendedJob, { contextPackId, scope }),
      write_sets: buildWriteSets({
        recommendedJob,
        candidateChangeId,
        requiredReviewLanes,
        proposedRecordPaths: outputSpec.proposedRecordPaths
      }),
      conflict_keys: buildConflictKeys({ recommendedJob, candidateChangeId, requiredReviewLanes }),
      parallel_group: parallelGroupForJob(recommendedJob),
      reconciliation_required: reconciliationRequiredForJob(recommendedJob),
      expected_cost: jobCost(recommendedJob)
    },
    post_run: {
      export_latest: true,
      verify_knowledge_base: true
    },
    quality_gates: buildQualityGates(recommendedJob),
    notes: [
      `Generated from ${triageStatePath} recommended_jobs[] item ${sourceJobId(recommendedJob)}.`,
      `Source queue: ${recommendedJob.source}.`,
      ...(recommendedJob.job_type === "candidate_promotion"
        ? [
            `Dry-run promotion command: ${recommendedJob.suggested_command}.`,
            "This job verifies promotion readiness only; coordinator promotion remains explicit through npm run promote:candidate."
          ]
        : []),
      ...(recommendedJob.review_lane ? [`Supervisor review lane: ${recommendedJob.review_lane}.`] : []),
      "The worker should keep edits bounded to the target record, listed inputs, and the candidate repair ledger."
    ]
  };
}

function expandedCandidateReviewJobs(recordIndex, recommendedJob) {
  return reviewLanesForJob(recordIndex, recommendedJob).map((reviewLane) => ({
    ...recommendedJob,
    source_job_id: recommendedJob.job_id,
    job_id: `${recommendedJob.job_id}-${reviewLane.replace(/_/g, "-")}`,
    rationale: `Required review lane is missing: ${reviewLane}.`,
    review_lane: reviewLane,
    required_review_lanes: [reviewLane]
  }));
}

function expandedRecommendedJobs(recordIndex, recommendedJob) {
  if (recommendedJob.job_type === "candidate_review") {
    return expandedCandidateReviewJobs(recordIndex, recommendedJob);
  }

  return [recommendedJob];
}

function candidateReviewTargetFromJob(job) {
  const laneKey = (job.orchestration?.write_sets ?? []).find((key) => key.startsWith("candidate_review:"));
  const match = laneKey?.match(/^candidate_review:([^/]+)\/([^/]+)$/);
  if (!match) {
    return undefined;
  }

  return {
    candidateChangeId: match[1],
    reviewLane: match[2],
    path: `data/candidate-changes/${match[1]}.json`
  };
}

function recordPointerFromRecord(record, recordPath, role) {
  if (!record?.record_type || !record?.id || !recordPath) {
    return undefined;
  }

  return {
    record_type: record.record_type,
    record_id: record.id,
    path: recordPath,
    ...(role ? { role } : {})
  };
}

function recordPointerFromPath(recordIndex, recordPath, role) {
  return recordPointerFromRecord(recordIndex.byPath.get(recordPath), recordPath, role);
}

function targetRecordPointerFromPath(recordIndex, recordPath, role) {
  const pointer = recordPointerFromPath(recordIndex, recordPath, role);
  if (pointer) {
    return {
      ...pointer,
      record_state: "existing"
    };
  }

  const candidateMatch = recordPath.match(/^data\/candidate-changes\/([^/]+)\.json$/);
  if (!candidateMatch) {
    return undefined;
  }

  return {
    record_type: "candidate_change",
    record_id: candidateMatch[1],
    path: recordPath,
    ...(role ? { role } : {}),
    record_state: "proposed"
  };
}

function hasOpenMajorOrCriticalFinding(review) {
  return (review.findings ?? []).some((finding) =>
    ["critical", "major"].includes(finding.severity) && finding.resolution_status === "open"
  );
}

function isCompleteAcceptingReview(review) {
  return (
    review.status === "complete" &&
    review.verdict === "accept" &&
    review.blocking === false &&
    !hasOpenMajorOrCriticalFinding(review)
  );
}

function reviewRecordsForCandidate(recordIndex, candidate) {
  return (candidate.evidence_review_ids ?? [])
    .map((reviewId) => {
      const reviewPath = `data/evidence-reviews/${reviewId}.json`;
      const review = recordIndex.byPath.get(reviewPath);
      if (!review) {
        return undefined;
      }
      return { review, path: reviewPath };
    })
    .filter(Boolean);
}

function relevantInputRecordsForCandidate(recordIndex, candidate, targetCandidatePath) {
  const paths = [
    targetCandidatePath,
    ...(candidate.proposed_records ?? []).map((record) => record.path)
  ];

  return sortStrings(paths)
    .map((recordPath) => recordPointerFromPath(recordIndex, recordPath, recordPath === targetCandidatePath ? "target_candidate" : "proposed_record"))
    .filter(Boolean);
}

export function supervisorReviewContextPackPath(job) {
  if (job.agent_role !== "supervisor_agent") {
    return undefined;
  }
  return job.context_pack_path;
}

export function extractionContextPackPath(job) {
  if (job.agent_role !== "extraction_agent") {
    return undefined;
  }
  return job.context_pack_path;
}

function scopedInputRecords(recordIndex, job) {
  const readPaths = (job.orchestration?.read_sets ?? [])
    .map((readSet) => readSet.match(/^path:(data\/.+\.json)$/)?.[1])
    .filter(Boolean);

  return sortStrings(readPaths)
    .map((recordPath) => recordPointerFromPath(recordIndex, recordPath, "scoped_input"))
    .filter(Boolean);
}

function targetRecordPointers(recordIndex, job) {
  return (job.expected_outputs?.proposed_record_paths ?? [])
    .map((recordPath) =>
      targetRecordPointerFromPath(
        recordIndex,
        recordPath,
        recordPath.includes("/candidate-changes/") ? "candidate_ledger" : "target_record"
      )
    )
    .filter(Boolean);
}

export function buildExtractionContextPack(recordIndex, job) {
  return {
    schema_version: "1.0.0",
    record_type: "extraction_context_pack",
    id: job.id,
    pack_type: "record_scoped_extraction",
    created_at: "2026-06-28T00:00:00Z",
    purpose: `Bounded extraction refresh for ${job.expected_outputs.candidate_change_id}.`,
    scope: job.scope,
    target_context: {
      input_records: scopedInputRecords(recordIndex, job),
      target_records: targetRecordPointers(recordIndex, job)
    },
    extraction_targets: [
      {
        target_label: job.scope?.question ?? job.summary,
        interpretation_rules: [
          "Use only the scoped input records and any retained source or text snapshots named by those records unless validation exposes a concrete inconsistency.",
          "Preserve missing, ambiguous, or not-reported source cells as uncertainty rather than inventing exact effects.",
          "Write changes through the declared candidate_change ledger; do not directly promote or apply the candidate."
        ]
      }
    ],
    schema_context: {
      schema_paths: [
        "schemas/agent-run.codex-output.schema.json",
        "schemas/agent-run.schema.json",
        "schemas/candidate-change.schema.json",
        "schemas/result.schema.json",
        "schemas/outcome.schema.json",
        "schemas/study.schema.json",
        "schemas/source.schema.json"
      ],
      required_fields: [
        "agent_run.outputs.candidate_change_id",
        "agent_run.outputs.proposed_records[]",
        "agent_run.outputs.generated_files[]",
        "agent_run.quality_checks[]",
        "candidate_change.proposed_records[]",
        "candidate_change.required_review_lanes[] equals expected_outputs.required_review_lanes[]"
      ],
      known_schema_limitations: [
        "This generated pack scopes records and schemas; it does not preselect retained artifact line locators."
      ]
    },
    exemplar_records: [],
    expected_outputs: {
      candidate_change_id: job.expected_outputs.candidate_change_id,
      proposed_record_paths: job.expected_outputs.proposed_record_paths,
      generated_file_paths: job.expected_outputs.generated_file_paths,
      export_paths: job.expected_outputs.export_paths,
      required_review_lanes: job.expected_outputs.required_review_lanes
    },
    verification: {
      worker_commands: [
        "npm run validate:records",
        "npm run audit:references",
        "npm run audit:agent-schemas",
        "npm run audit:agentic-process"
      ],
      coordinator_post_run: [
        "npm run export:latest",
        "npm run verify:knowledge-base"
      ]
    },
    constraints: [
      "Read the context pack first and keep repository inspection bounded to the pack, scoped read_sets, and listed verification commands.",
      "Create only the repair candidate and target record paths declared in expected_outputs.",
      "Set the repair candidate required_review_lanes[] exactly to expected_outputs.required_review_lanes[].",
      "Do not perform broad repository searches or full-record dumps unless validation identifies a specific missing path or schema inconsistency."
    ],
    known_limitations: [
      "Source artifact locators may need to be discovered from scoped source_snapshot or text_snapshot records when present.",
      "The pack is a routing contract for extraction repair, not a source-fidelity review."
    ]
  };
}

export function buildSupervisorReviewContextPack(recordIndex, job) {
  const target = candidateReviewTargetFromJob(job);
  if (!target) {
    throw new Error(`${job.id}: candidate-review job is missing a candidate_review write-set key.`);
  }

  const targetCandidate = recordIndex.byPath.get(target.path);
  if (!targetCandidate) {
    throw new Error(`${job.id}: target candidate path does not exist: ${target.path}`);
  }

  const activeReviews = reviewRecordsForCandidate(recordIndex, targetCandidate);
  const completeAcceptingReviewLanes = sortStrings(
    activeReviews
      .filter(({ review }) => isCompleteAcceptingReview(review))
      .map(({ review }) => review.review_lane)
  );
  const missingReviewLanes = sortStrings((targetCandidate.required_review_lanes ?? []).filter((lane) => !completeAcceptingReviewLanes.includes(lane)));
  const openMajorOrCriticalReviewIds = sortStrings(
    activeReviews
      .filter(({ review }) => hasOpenMajorOrCriticalFinding(review))
      .map(({ review }) => review.id)
  );
  const evidenceReviewId = job.expected_outputs?.proposed_record_paths
    ?.map((recordPath) => recordPath.match(/^data\/evidence-reviews\/([^/]+)\.json$/)?.[1])
    .find(Boolean);

  return {
    schema_version: "1.0.0",
    record_type: "supervisor_review_context_pack",
    id: job.id,
    pack_type: "candidate_review_lane",
    created_at: targetCandidate.submitted_at,
    purpose: `Bounded supervisor review for ${target.candidateChangeId} lane ${target.reviewLane}.`,
    scope: job.scope,
    target_candidate: {
      candidate_change_id: target.candidateChangeId,
      path: target.path,
      lifecycle_status: targetCandidate.lifecycle_status,
      ...(targetCandidate.summary ? { summary: targetCandidate.summary } : {}),
      required_review_lanes: sortStrings(targetCandidate.required_review_lanes),
      proposed_record_count: targetCandidate.proposed_records?.length ?? 0,
      proposed_records: (targetCandidate.proposed_records ?? []).map((record) => ({
        record_type: record.record_type,
        record_id: record.record_id,
        path: record.path,
        change_type: record.change_type,
        rationale: record.rationale
      }))
    },
    review_lane: target.reviewLane,
    review_context: {
      active_review_records: activeReviews
        .map(({ review, path: reviewPath }) => recordPointerFromRecord(review, reviewPath, "active_review"))
        .filter(Boolean),
      complete_accepting_review_lanes: completeAcceptingReviewLanes,
      missing_review_lanes: missingReviewLanes,
      open_major_or_critical_review_ids: openMajorOrCriticalReviewIds,
      lane_acceptance_criteria: [
        "Review only the target candidate and the single review lane named by review_lane.",
        "Use verdict accept only when the lane is complete, non-blocking, and has no open major or critical findings.",
        "Use needs_revision or reject when the proposed records fail this lane's source, extraction, taxonomy, synthesis, or safety boundary.",
        "When the lane is acceptable, include a passed quality_checks[] entry named supervisor_review_lanes in the final agent_run.",
        "When outputs.proposed_records[] matches the repair candidate ledger, include a passed quality_checks[] entry named candidate_agent_run_ledger_match in the final agent_run."
      ],
      relevant_input_records: relevantInputRecordsForCandidate(recordIndex, targetCandidate, target.path)
    },
    schema_context: {
      schema_paths: [
        "schemas/agent-run.codex-output.schema.json",
        "schemas/agent-run.schema.json",
        "schemas/evidence-review.schema.json",
        "schemas/candidate-change.schema.json"
      ],
      required_fields: [
        "agent_run.outputs.candidate_change_id",
        "agent_run.outputs.proposed_records[]",
        "agent_run.outputs.generated_files[]",
        "agent_run.quality_checks[]",
        "candidate_change.proposed_records[]",
        "candidate_change.required_review_lanes[] equals expected_outputs.required_review_lanes[]",
        "evidence_review.review_lane",
        "evidence_review.verdict",
        "evidence_review.findings[]"
      ],
      known_schema_limitations: [
        "codex_job.expected_outputs records expected file paths, while this context pack additionally names the evidence_review_id for the lane."
      ]
    },
    expected_outputs: {
      candidate_change_id: job.expected_outputs.candidate_change_id,
      evidence_review_id: evidenceReviewId,
      proposed_record_paths: job.expected_outputs.proposed_record_paths,
      generated_file_paths: job.expected_outputs.generated_file_paths,
      export_paths: job.expected_outputs.export_paths,
      required_review_lanes: job.expected_outputs.required_review_lanes
    },
    verification: {
      worker_commands: [
        "npm run validate:records",
        "npm run audit:references",
        "npm run audit:agent-schemas",
        "npm run audit:agentic-process"
      ],
      coordinator_post_run: [
        "npm run export:triage-state",
        "npm run reconcile:parallel",
        "npm run metrics:orchestration",
        "npm run export:release-readiness",
        "npm run export:latest",
        "npm run verify:knowledge-base"
      ]
    },
    constraints: [
      "Create only the repair candidate and evidence_review paths declared in expected_outputs.",
      "Set the repair candidate required_review_lanes[] exactly to expected_outputs.required_review_lanes[].",
      "Do not promote, apply, or directly mutate the target candidate during a lane review.",
      "Do not add open-ended human-judgment escape hatches; make an agentic supervisor verdict from the available records.",
      "Inspect additional files only when the pack points to them or validation reveals a pack inconsistency.",
      "Do not perform broad repository searches or full-record dumps for pack-backed reviews; query only the specific ids and paths required by this pack."
    ],
    known_limitations: [
      "The pack is a compact routing contract, not a replacement for inspecting the target candidate's proposed records.",
      "Prior review state is summarized from evidence_review_ids already attached to the target candidate."
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
    if (options.priority && recommendedJob.priority !== options.priority) {
      continue;
    }
    if (options.jobType && recommendedJob.job_type !== options.jobType) {
      continue;
    }
    for (const expandedJob of expandedRecommendedJobs(recordIndex, recommendedJob)) {
      const job = buildJob(recordIndex, expandedJob);
      if (await exists(path.join(workspaceRoot, job.output_path))) {
        continue;
      }
      jobs.push(job);
      if (jobs.length >= limit) {
        return jobs;
      }
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

async function referencedContextPackPaths() {
  const roots = ["ops/codex-jobs/live", "ops/codex-jobs/archive"];
  const paths = new Set();
  for (const root of roots) {
    for (const filePath of await walkJsonFiles(path.join(workspaceRoot, root))) {
      const job = JSON.parse(await fs.readFile(filePath, "utf8"));
      if (job.record_type === "codex_job" && job.context_pack_path) {
        paths.add(job.context_pack_path);
      }
    }
  }
  return paths;
}

async function pruneObsoleteGeneratedJobs({ outputDir, expectedJobs }) {
  const expectedPaths = new Set(expectedJobs.map((job) => generatedJobPath(job, outputDir)));
  const files = await walkJsonFiles(path.join(workspaceRoot, outputDir));
  const removed = [];

  for (const filePath of files) {
    const relativePath = toPosixRelative(filePath);
    if (expectedPaths.has(relativePath)) {
      continue;
    }

    await fs.rm(filePath);
    removed.push(relativePath);
  }

  return removed;
}

async function pruneObsoleteContextPacks({ root, expectedJobs, contextPackPathForJob, preservePaths = new Set(), generatedIdPrefix }) {
  const expectedPaths = new Set(
    [
      ...expectedJobs
        .map((job) => contextPackPathForJob(job))
        .filter(Boolean),
      ...preservePaths
    ]
  );
  const files = await walkJsonFiles(path.join(workspaceRoot, root));
  const removed = [];

  for (const filePath of files) {
    const relativePath = toPosixRelative(filePath);
    if (generatedIdPrefix && !path.basename(relativePath).startsWith(generatedIdPrefix)) {
      continue;
    }
    if (expectedPaths.has(relativePath)) {
      continue;
    }

    await fs.rm(filePath);
    removed.push(relativePath);
  }

  return removed;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const recordIndex = await loadCanonicalRecords();
  const existingIds = await existingJobIds();
  const jobs = await buildSelfHealingJobs({ ...options, recordIndex });
  const output = [];

  for (const job of jobs) {
    const relativePath = generatedJobPath(job, options.outputDir);
    const alreadyExists = existingIds.has(job.id);
    const written = options.dryRun || (alreadyExists && !options.replace)
      ? false
      : await writeJson(relativePath, job, { replace: options.replace });
    const contextPackPath = supervisorReviewContextPackPath(job) ?? extractionContextPackPath(job);
    const contextPack = supervisorReviewContextPackPath(job)
      ? buildSupervisorReviewContextPack(recordIndex, job)
      : extractionContextPackPath(job)
        ? buildExtractionContextPack(recordIndex, job)
        : undefined;
    const contextPackWritten = options.dryRun || !contextPackPath || (alreadyExists && !options.replace)
      ? false
      : await writeJson(contextPackPath, contextPack, { replace: options.replace });

    output.push({
      id: job.id,
      path: relativePath,
      ...(contextPackPath ? { context_pack_path: contextPackPath } : {}),
      status: options.dryRun ? "planned" : written ? "written" : alreadyExists ? "existing_job_id" : "existing_path",
      ...(contextPackPath
        ? { context_pack_status: options.dryRun ? "planned" : contextPackWritten ? "written" : alreadyExists ? "existing_job_id" : "existing_path" }
        : {})
    });
  }

  const expectedJobsForPrune = !options.dryRun
    ? await buildSelfHealingJobs({ limit: Number.POSITIVE_INFINITY, recordIndex })
    : [];
  const removedObsoletePaths = !options.dryRun
    ? await pruneObsoleteGeneratedJobs({
        outputDir: options.outputDir,
        expectedJobs: expectedJobsForPrune
      })
    : [];
  const preservedContextPackPaths = !options.dryRun
    ? await referencedContextPackPaths()
    : new Set();
  const removedObsoleteContextPackPaths = !options.dryRun
    ? [
        ...(await pruneObsoleteContextPacks({
          root: supervisorReviewContextPackRoot,
          expectedJobs: expectedJobsForPrune,
          contextPackPathForJob: supervisorReviewContextPackPath,
          preservePaths: preservedContextPackPaths
        })),
        ...(await pruneObsoleteContextPacks({
          root: extractionContextPackRoot,
          expectedJobs: expectedJobsForPrune,
          contextPackPathForJob: extractionContextPackPath,
          preservePaths: preservedContextPackPaths,
          generatedIdPrefix: "self-healing-"
        }))
      ]
    : [];

  const summary = {
    generated_from: triageStatePath,
    selected_job_count: jobs.length,
    dry_run: options.dryRun,
    jobs: output,
    removed_obsolete_paths: removedObsoletePaths,
    removed_obsolete_context_pack_paths: removedObsoleteContextPackPaths
  };

  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
